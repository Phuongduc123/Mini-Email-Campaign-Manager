import '@testing-library/jest-dom';

// Zustand persist middleware uses localStorage — provide a minimal in-memory mock
const localStorageMock = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (n: number) => Object.keys(store)[n] ?? null,
    get length() { return Object.keys(store).length; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});
