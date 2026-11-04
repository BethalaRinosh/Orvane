import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryFile {
  version: 1;
  entries: MemoryEntry[];
}

const MAX_ENTRIES = 500;
const MAX_KEY_LENGTH = 80;
const MAX_VALUE_LENGTH = 1_000;
const MAX_RECALL_RESULTS = 8;

/**
 * Small, dependency-free persistent memory for facts the user explicitly asks
 * Orvane to remember. No conversation is silently mined or stored.
 */
export class PersistentMemoryStore {
  constructor(private readonly filePath: string) {}

  async remember(keyInput: string, valueInput: string): Promise<MemoryEntry> {
    const key = cleanText(keyInput, MAX_KEY_LENGTH, "Memory key");
    const value = cleanText(valueInput, MAX_VALUE_LENGTH, "Memory value");
    if (looksSensitive(key, value)) throw new Error("This looks like a credential or sensitive secret and cannot be saved to memory.");
    const file = await this.load();
    const now = Date.now();
    const existing = file.entries.find((entry) => entry.key.toLocaleLowerCase() === key.toLocaleLowerCase());
    const entry: MemoryEntry = existing
      ? { ...existing, key, value, updatedAt: now }
      : { id: randomUUID(), key, value, createdAt: now, updatedAt: now };
    const entries = existing
      ? file.entries.map((item) => item.id === existing.id ? entry : item)
      : [...file.entries, entry].slice(-MAX_ENTRIES);
    await this.save({ version: 1, entries });
    return entry;
  }

  async recall(queryInput: string, limit = 5): Promise<MemoryEntry[]> {
    const query = String(queryInput ?? "").trim().toLocaleLowerCase();
    const entries = (await this.load()).entries;
    if (!query) return entries.slice(-clampLimit(limit)).reverse();

    const terms = [...new Set(query.split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1))];
    const ranked = entries.map((entry) => {
      const haystack = `${entry.key} ${entry.value}`.toLocaleLowerCase();
      const score = (haystack.includes(query) ? 4 : 0) +
        terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { entry, score };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt);
    return ranked.slice(0, clampLimit(limit)).map((item) => item.entry);
  }

  async forget(keyInput: string): Promise<boolean> {
    const key = String(keyInput ?? "").trim();
    if (!key) throw new Error("Memory key is required.");
    const file = await this.load();
    const entries = file.entries.filter((entry) => entry.key.toLocaleLowerCase() !== key.toLocaleLowerCase());
    if (entries.length === file.entries.length) return false;
    await this.save({ version: 1, entries });
    return true;
  }

  async list(): Promise<MemoryEntry[]> {
    return (await this.load()).entries.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private async load(): Promise<MemoryFile> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, entries: [] };
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Orvane memory file is corrupted. The file was left untouched.");
    }
    if (!isMemoryFile(parsed)) throw new Error("Orvane memory file has an unsupported format. The file was left untouched.");
    return { version: 1, entries: parsed.entries.slice(-MAX_ENTRIES) };
  }

  private async save(file: MemoryFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

function cleanText(value: string, maxLength: number, label: string): string {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error(`${label} cannot be empty.`);
  if (cleaned.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  return cleaned;
}

function looksSensitive(key: string, value: string): boolean {
  const sensitiveLabel = /\\b(password|passcode|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|secret|private[ _-]?key|credit[ _-]?card|cvv|bank[ _-]?account)\\b/i;
  return sensitiveLabel.test(key) || sensitiveLabel.test(value) || /\\bsk-[A-Za-z0-9_-]{16,}\\b/.test(value);
}

function clampLimit(value: number): number {
  return Math.min(MAX_RECALL_RESULTS, Math.max(1, Math.round(Number(value) || 5)));
}

function isMemoryFile(value: unknown): value is MemoryFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MemoryFile>;
  return candidate.version === 1 && Array.isArray(candidate.entries) &&
    candidate.entries.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Partial<MemoryEntry>;
      return typeof item.id === "string" && typeof item.key === "string" &&
        typeof item.value === "string" && Number.isFinite(item.createdAt) &&
        Number.isFinite(item.updatedAt);
    });
}
