/** Short-lived, memory-only reads. Never persisted or shared between auth identities. */
export function createSessionCache(ttlMs = 15_000) {
  const entries = new Map<string, { value: unknown; at: number }>();
  const pending = new Map<string, Promise<unknown>>();
  let generation = 0;
  return {
    async read<T>(identity: string, resource: string, load: () => Promise<T>): Promise<T> {
      const key = JSON.stringify([identity, resource]);
      const hit = entries.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
      const current = pending.get(key);
      if (current) return current as Promise<T>;
      const version = generation;
      const request = load().then((value) => {
        if (version === generation) entries.set(key, { value, at: Date.now() });
        return value;
      }).finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
      pending.set(key, request);
      return request;
    },
    clear() { generation += 1; entries.clear(); pending.clear(); },
  };
}

export const clinicalReadCache = createSessionCache();