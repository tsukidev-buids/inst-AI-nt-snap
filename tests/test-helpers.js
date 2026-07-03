/**
 * Test helper utilities for mocking Chrome extension APIs.
 * Provides fake implementations for dependency injection in Inst-AI-nt Snap modules.
 */

/**
 * Creates a mock chrome.storage area (local or session).
 * Supports get, set, remove, and clear operations with an in-memory store.
 */
export function createMockChromeStorage() {
  let store = {};

  return {
    get _store() {
      return { ...store };
    },

    async get(keys) {
      if (keys === null || keys === undefined) {
        return { ...store };
      }
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const result = {};
        for (const key of keys) {
          if (key in store) result[key] = store[key];
        }
        return result;
      }
      // Object with defaults
      const result = {};
      for (const [key, defaultValue] of Object.entries(keys)) {
        result[key] = key in store ? store[key] : defaultValue;
      }
      return result;
    },

    async set(items) {
      Object.assign(store, items);
    },

    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        delete store[key];
      }
    },

    async clear() {
      store = {};
    }
  };
}

/**
 * Creates a mock crypto object with randomUUID and getRandomValues.
 */
export function createMockCrypto() {
  let counter = 0;

  return {
    randomUUID() {
      counter++;
      return `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`;
    },

    getRandomValues(array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }
  };
}

/**
 * Creates a mock fetch function that returns configurable responses.
 * Tracks all calls for assertions.
 */
export function createMockFetch(response) {
  const calls = [];

  const mockFn = async (url, options) => {
    calls.push({ url, options });
    if (response instanceof Error) throw response;
    return {
      ok: true,
      json: async () => response,
      text: async () => JSON.stringify(response)
    };
  };

  mockFn.calls = calls;
  return mockFn;
}

/**
 * Creates a full deps object for license module testing.
 */
export function createLicenseDeps(overrides = {}) {
  return {
    storage: createMockChromeStorage(),
    crypto: createMockCrypto(),
    fetch: createMockFetch({}),
    ...overrides
  };
}
