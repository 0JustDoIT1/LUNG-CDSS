type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear" | "key"> & {
  readonly length: number;
};

const memoryStore = new Map<string, string>();

function createMemoryStorage(): StorageLike {
  return {
    get length() {
      return memoryStore.size;
    },
    getItem(key: string) {
      return memoryStore.has(key) ? memoryStore.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memoryStore.set(key, String(value));
    },
    removeItem(key: string) {
      memoryStore.delete(key);
    },
    clear() {
      memoryStore.clear();
    },
    key(index: number) {
      return Array.from(memoryStore.keys())[index] ?? null;
    },
  };
}

export function getSafeStorage(): StorageLike {
  try {
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      return window.localStorage as StorageLike;
    }
  } catch {
    // Ignore access errors and fall back to in-memory storage.
  }
  return createMemoryStorage();
}

export function getStoredItem(key: string): string | null {
  return getSafeStorage().getItem(key);
}

export function setStoredItem(key: string, value: string): void {
  getSafeStorage().setItem(key, value);
}

export function removeStoredItem(key: string): void {
  getSafeStorage().removeItem(key);
}

export function clearStoredItems(): void {
  getSafeStorage().clear();
}
