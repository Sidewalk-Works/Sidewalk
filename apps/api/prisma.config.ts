import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The single root .env feeds the API, Prisma and the web app. DOTENV_CONFIG_PATH lets tests point elsewhere.
config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../.env"),
  quiet: true
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` (typecheck and build) needs no database, so a checkout or build machine without one still works.
  // Commands that do connect stop with Prisma's own "datasource url is required" error.
  datasource: process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : undefined
});
