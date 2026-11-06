import { defineConfig } from "vitest/config";
import path from "node:path";

// Cấu hình riêng cho PoC đánh giá Agent; không chạy trong npm test.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["eval/**/*.eval.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 400_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../src"),
    },
  },
});
