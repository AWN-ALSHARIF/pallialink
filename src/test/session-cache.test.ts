import { describe, expect, it, vi } from "vitest";
import { createSessionCache } from "@/lib/session-cache";

describe("identity-scoped clinical reads", () => {
  it("never shares a nurse's result with another identity", async () => {
    const cache = createSessionCache();
    expect(await cache.read("u-nurse", "tasks", async () => ["NT-Elias"])).toEqual(["NT-Elias"]);
    expect(await cache.read("u-xnurse", "tasks", async () => ["NT-Taleen"])).toEqual(["NT-Taleen"]);
  });
  it("deduplicates overlapping reads and expires at 15 seconds", async () => {
    vi.useFakeTimers();
    try {
      const cache = createSessionCache();
      const load = vi.fn(async () => ["NT-1"]);
      await Promise.all([cache.read("nurse", "tasks", load), cache.read("nurse", "tasks", load)]);
      expect(load).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15_000);
      await cache.read("nurse", "tasks", load);
      expect(load).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it("does not cache failures", async () => {
    const cache = createSessionCache();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(["NT-2"]);
    await expect(cache.read("nurse", "tasks", load)).rejects.toThrow("offline");
    expect(await cache.read("nurse", "tasks", load)).toEqual(["NT-2"]);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("invalidates after writes without resurrecting older pending data", async () => {
    const cache = createSessionCache();
    let resolve: ((value: string[]) => void) | undefined;
    const older = cache.read("nurse", "tasks", () => new Promise<string[]>((done) => { resolve = done; }));
    cache.clear();
    expect(await cache.read("nurse", "tasks", async () => ["reviewed"])).toEqual(["reviewed"]);
    resolve?.(["new"]);
    await older;
    expect(await cache.read("nurse", "tasks", async () => ["wrong"])).toEqual(["reviewed"]);
  });
});