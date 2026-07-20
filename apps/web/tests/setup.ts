import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

// Newer Node versions expose an unavailable experimental localStorage global
// unless a backing file is configured. Give happy-dom a deterministic browser
// implementation so tests do not depend on the host Node invocation.
Object.defineProperty(globalThis.window, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
});

afterEach(() => {
  cleanup();
  globalThis.window.localStorage.clear();
});
