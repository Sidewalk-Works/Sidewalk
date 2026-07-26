import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export default defineConfig({
  resolve: {
    alias: {
      "@qyou/shared": path.resolve(root, "packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret-test-secret"
    }
  }
});
