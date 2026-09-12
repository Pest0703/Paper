import { describe, expect, it } from "vitest";
import { LruCache } from "./lru";

describe("bounded LRU", () => {
  it("retains only the three most recently used heavy values", () => {
    const cache = new LruCache<string, object>(3);
    for (const id of ["A", "B", "C"]) cache.set(id, {});
    cache.get("A");
    cache.set("D", {});
    cache.set("E", {});
    expect(cache.size).toBe(3);
    expect(cache.keys()).toEqual(["A", "D", "E"]);
  });
});
