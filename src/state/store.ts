/**
 * The persistence boundary — deliberately the thinnest thing that could work.
 *
 * Four async string operations, which is the subset of AsyncStorage's API we use and the
 * subset every plausible replacement provides. Everything above this line (Session
 * lifecycle, statistics, migrations, export/import) is pure and runs in plain Node against
 * `createMemoryStore()`, so no test in this module mocks AsyncStorage or imports React
 * Native at all.
 *
 * The React Native adapter lives in `./asyncStorage` and is imported directly by the app.
 * It is deliberately *not* re-exported from `index.ts`, because that would drag React
 * Native into the test environment through the barrel file.
 */

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

/** An in-memory store. Used by tests, and by a preview build that should leave no trace. */
export function createMemoryStore(initial?: Readonly<Record<string, string>>): KeyValueStore {
  const items = new Map<string, string>(Object.entries(initial ?? {}));

  return {
    getItem: (key) => Promise.resolve(items.get(key) ?? null),
    setItem: (key, value) => {
      items.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      items.delete(key);
      return Promise.resolve();
    },
    getAllKeys: () => Promise.resolve([...items.keys()]),
  };
}
