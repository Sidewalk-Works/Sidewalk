export const STORAGE = Symbol("STORAGE");

export interface StoredObjectInfo {
  key: string;
  lastModified: Date;
}

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

/** Everything the app needs from object storage. S3, local disk, or anything else can sit behind it. */
export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Lists stored objects under a prefix (operations tooling only; can be large). */
  list(prefix: string): Promise<StoredObjectInfo[]>;
  /** Cheap reachability check used by the readiness probe. */
  ping(): Promise<void>;
}

export const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,200}$/;

export function assertSafeKey(key: string): void {
  if (!STORAGE_KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Unsafe storage key");
}
