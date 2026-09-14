/**
 * The AsyncStorage adapter — the only file in `src/state` that touches a platform API.
 *
 * AsyncStorage is backed by localStorage on web, SQLite on Android, and a file-backed
 * dictionary on iOS, which is what makes "Sessions survive an app restart on all three
 * platforms" a single implementation rather than three (ADR-0001, ADR-0003).
 *
 * Imported directly by the app, never through `./index`, so that the pure modules stay
 * runnable in plain Node.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KeyValueStore } from "./store";

export function createAsyncStorageStore(): KeyValueStore {
  return {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
    getAllKeys: async () => AsyncStorage.getAllKeys(),
  };
}
