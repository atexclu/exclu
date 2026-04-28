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
      "supabase/functions/_shared/**/*.{test,spec}.ts",
    ],
    // Server-side helpers (api/_shared/, supabase/functions/_shared/) use
    // Node globals (AbortController, fetch, Response) and stub Deno.env;
    // run them under Node to match runtime semantics. React tests stay on
    // jsdom.
    environmentMatchGlobs: [
      ["api/_shared/**", "node"],
      ["supabase/functions/_shared/**", "node"],
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
