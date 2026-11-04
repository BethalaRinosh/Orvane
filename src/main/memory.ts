import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface MemoryEntry {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryFile {
  version: 1;
  entries: MemoryEntry[];
}

const MAX_ENTRIES = 100;
const MAX_CONTENT_LENGTH = 1_200;
const MAX_RESULTS = 5;

export class MemoryStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async remember(content: string): Promise<MemoryEntry> {
    const normalized = normalizeContent(content);
    if (!normalized) throw new Error("Memory content cannot be empty.");
    if (normalized.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Memory content must be at most ${MAX_CONTENT_LENGTH} characters.`);
    }

    return this.mutate((entries) => {
      const existing = entries.find((entry) => entry.content.toLocaleLowerCase() === normalized.toLocaleLowerCase());
      const now = Date.now();
      if (existing) {
        existing.content = normalized;
        existing.updatedAt = now;
        return { entries, result: existing };
      }
      const entry: MemoryEntry = { id: randomUUID(), content: normalized, createdAt: now, updatedAt: now };
      entries.push(entry);
      if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
      return { entries, result: entry };
    });
  }

  async search(query: string): Promise<MemoryEntry[]> {
    const normalized = normalizeContent(query).toLocaleLowerCase();
    if (!normalized) return [];
    const terms = [...new Set(normalized.split(/\s+/).filter((term) => term.length > 1))];
    const { entries } = await this.read();
    return entries
      .map((entry) => {
        const content = entry.content.toLocaleLowerCase();
        const score = content.includes(normalized) ? terms.length + 1 : terms.reduce((sum, term) => sum + (content.includes(term) ? 1 : 0), 0);
        return { entry, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt)
      .slice(0, MAX_RESULTS)
      .map(({ entry }) => entry);
  }

  async forget(id: string): Promise<boolean> {
    const normalizedId = String(id).trim();
    if (!normalizedId) return false;
    return this.mutate((entries) => {
      const index = entries.findIndex((entry) => entry.id === normalizedId);
      if (index < 0) return { entries, result: false };
      entries.splice(index, 1);
      return { entries, result: true };
    });
  }

  async list(): Promise<MemoryEntry[]> {
    return (await this.read()).entries;
  }

  private async mutate<T>(operation: (entries: MemoryEntry[]) => { entries: MemoryEntry[]; result: T }): Promise<T> {
    let resolveResult!: (value: T) => void;
    let rejectResult!: (reason: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const current = await this.read();
        const changed = operation(current.entries);
        await this.write({ version: 1, entries: changed.entries });
        resolveResult(changed.result);
      } catch (error) {
        rejectResult(error);
      }
    });
    await this.writeQueue;
    return result;
  }

  private async read(): Promise<MemoryFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<MemoryFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
        throw new Error("Memory file has an unsupported or invalid format. It was left untouched.");
      }
      const entries = parsed.entries.filter(isMemoryEntry).slice(-MAX_ENTRIES);
      return { version: 1, entries };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, entries: [] };
      throw error;
    }
  }

  private async write(data: MemoryFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

function normalizeContent(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isMemoryEntry(value: unknown): value is MemoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<MemoryEntry>;
  return typeof entry.id === "string"
    && typeof entry.content === "string"
    && entry.content.length > 0
    && typeof entry.createdAt === "number"
    && Number.isFinite(entry.createdAt)
    && typeof entry.updatedAt === "number"
    && Number.isFinite(entry.updatedAt);
}
