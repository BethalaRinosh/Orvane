import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentMemoryStore } from "./memory.js";

const directories: string[] = [];
async function createStore(): Promise<PersistentMemoryStore> {
  const directory = await mkdtemp(join(tmpdir(), "orvane-memory-"));
  directories.push(directory);
  return new PersistentMemoryStore(join(directory, "memory.json"));
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("PersistentMemoryStore", () => {
  it("persists explicit memories and updates keys without duplicates", async () => {
    const store = await createStore();
    await store.remember("Preferred editor", "Visual Studio Code");
    await store.remember("preferred editor", "VS Code");
    const entries = await store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe("VS Code");
    expect(new PersistentMemoryStore(join(directories[0], "memory.json"))).toBeDefined();
  });

  it("recalls relevant entries and returns recent entries for an empty query", async () => {
    const store = await createStore();
    await store.remember("Editor", "Visual Studio Code");
    await store.remember("Games", "Minecraft and Valorant");
    expect((await store.recall("valorant"))[0].key).toBe("Games");
    expect((await store.recall("")).map((entry) => entry.key)).toEqual(["Games", "Editor"]);
  });

  it("forgets a key case-insensitively and reports missing keys", async () => {
    const store = await createStore();
    await store.remember("Timezone", "Asia/Kolkata");
    expect(await store.forget("TIMEZONE")).toBe(true);
    expect(await store.forget("Timezone")).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it("rejects empty and oversized memory values", async () => {
    const store = await createStore();
    await expect(store.remember(" ", "value")).rejects.toThrow("Memory key cannot be empty");
    await expect(store.remember("key", "x".repeat(1_001))).rejects.toThrow("1000 characters or fewer");
  });

  it("fails closed on malformed files without overwriting them", async () => {
    const store = await createStore();
    const path = join(directories[0], "memory.json");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, "{broken", "utf8");
    await expect(store.list()).rejects.toThrow("corrupted");
    expect(await readFile(path, "utf8")).toBe("{broken");
  });
});
