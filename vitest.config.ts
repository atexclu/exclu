import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "api/_shared/**/*.{test,spec}.ts",
    ],
    // Server-side helpers live under api/_shared/. They use Node globals
    // (AbortController, fetch, Response) which work in jsdom today but
    // should be tested under the Node runtime to avoid masking edge-case
    // divergence. Everything else stays on jsdom for React component tests.
    environmentMatchGlobs: [["api/_shared/**", "node"]],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
