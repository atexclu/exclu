import "@testing-library/jest-dom";

// Guard the DOM-only setup so this file is safe to import under the Node
// test environment too (used by api/_shared/** tests via
// environmentMatchGlobs in vitest.config.ts).
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
