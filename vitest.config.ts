import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { obsidian: resolve(import.meta.dirname, "tests/obsidian.ts") } },
  test: { include: ["tests/**/*.test.ts"] },
});
