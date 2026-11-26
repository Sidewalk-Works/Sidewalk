import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client as Pg } from "pg";

const API_DIR = path.resolve(__dirname, "..");
const baseUrl = process.env.DATABASE_URL as string;
const swapDatabase = (url: string, name: string) => url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);

export interface ScratchDatabase {
  name: string;
  /** Connection string (with the `?schema=` suffix Prisma expects). */
  url: string;
  drop(): Promise<void>;
}

/**
 * A throwaway database for tests that need their own: a different time zone, a half-applied schema, a restore
 * target. Created next to the test database, optionally migrated with the committed migrations, and dropped
 * afterwards. It can never be the shared test database, and its name proves it is disposable.
 */
export async function createScratchDatabase(
  options: { timezone?: string; migrate?: boolean } = {}
): Promise<ScratchDatabase> {
  const name = `sidewalk_scratch_${randomBytes(4).toString("hex")}`;
  const adminUrl = swapDatabase(baseUrl, "postgres").replace(/\?schema=.*/, "");
  const admin = new Pg({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  if (options.timezone)
    await admin.query(`ALTER DATABASE "${name}" SET timezone TO '${options.timezone}'`);
  await admin.end();
  const url = swapDatabase(baseUrl, name);
  if (options.migrate !== false) {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe"
    });
  }
  return {
    name,
    url,
    async drop() {
      const again = new Pg({ connectionString: adminUrl });
      await again.connect();
      await again.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await again.end();
    }
  };
}
