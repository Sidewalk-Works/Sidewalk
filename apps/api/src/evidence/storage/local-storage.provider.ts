import { mkdir, readdir, readFile, rm, access, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeKey,
  type StorageProvider,
  type StoredObject,
  type StoredObjectInfo
} from "./storage.provider";

/** Development and test fallback. Content type is derived from the extension we control. */
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Unsafe storage key");
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      return { body: await readFile(this.resolve(key)), contentType: "image/webp" };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async list(prefix: string): Promise<StoredObjectInfo[]> {
    const out: StoredObjectInfo[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const key = path.relative(this.root, full).split(path.sep).join("/");
          if (key.startsWith(prefix)) out.push({ key, lastModified: (await stat(full)).mtime });
        }
      }
    };
    await walk(this.root);
    return out;
  }

  async ping(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root);
  }
}
