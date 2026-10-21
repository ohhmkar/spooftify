// localStorage as JSON, for per-browser conveniences only. It can throw (private mode, blocked storage) or be empty, so every
// read has a fallback and a failed write is ignored.
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  // undefined removes the key
  set(key: string, value: unknown) {
    try {
      if (value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
