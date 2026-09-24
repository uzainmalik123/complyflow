import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  esbuild: {
    // tsconfig sets "jsx": "preserve" (Next does the transform at build time);
    // Vitest needs esbuild to compile TSX itself using the automatic runtime.
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./tests/setup-env.ts"],
    testTimeout: 20000,
  },
});