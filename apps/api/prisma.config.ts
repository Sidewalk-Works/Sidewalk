import path from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The single root .env feeds the API, Prisma and the web app. DOTENV_CONFIG_PATH lets tests point elsewhere.
config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../.env"),
  quiet: true
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") }
});
