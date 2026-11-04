import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./memory.js";

let directory = "";

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

async function createStore(): Promise<MemoryStore> {
  directory = await mkdtemp(join(tmpdir(), "orvane-memory-"));
  return new MemoryStore(join(directory, "memory.json"));
}

describe("MemoryStore", () => {
  it("persists explicit memories and retrieves relevant matches", async () => {
    const store = await createStore();
    const saved = await store.remember("  Prefers dark mode  ");
    const reopened = new MemoryStore(join(directory, "memory.json"));
    expect((await reopened.search("dark mode"))[0]).toMatchObject({ id: saved.id, content: "Prefers dark mode" });
  });

  it("deduplicates case-insensitive memories", async () => {
    const store = await createStore();
    const first = await store.remember("Use dark mode");
    const second = await store.remember("use DARK mode");
    expect(second.id).toBe(first.id);
    expect(await store.list()).toHaveLength(1);
  });

  it("serializes concurrent writes without losing entries", async () => {
    const store = await createStore();
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.remember(`Preference ${index}`)));
    expect(await store.list()).toHaveLength(20);
  });

  it("forgets only the requested memory id", async () => {
    const store = await createStore();
    const first = await store.remember("First memory");
    await store.remember("Second memory");
    expect(await store.forget(first.id)).toBe(true);
    expect(await store.forget(first.id)).toBe(false);
    expect((await store.list()).map((entry) => entry.content)).toEqual(["Second memory"]);
  });

  it("rejects oversized and empty memories", async () => {
    const store = await createStore();
    await expect(store.remember("  ")).rejects.toThrow("cannot be empty");
    await expect(store.remember("x".repeat(1_201))).rejects.toThrow("at most 1200");
  });

  it("does not overwrite a corrupted memory file", async () => {
    const store = await createStore();
    const path = join(directory, "memory.json");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path, "{broken", "utf8"));
    await expect(store.remember("Keep this safe")).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("{broken");
  });
});
