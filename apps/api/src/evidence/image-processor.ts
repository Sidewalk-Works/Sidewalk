import { createHash } from "node:crypto";
import sharp from "sharp";
import { AppError } from "../common/app-error";

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  sha256: string;
}

type Sniffed = "jpeg" | "png" | "webp";

/** Identifies the real format from the file's own bytes. The client-declared type is never trusted. */
export function sniffImage(buf: Buffer): Sniffed | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  return null;
}

/**
 * Decodes and re-encodes the upload. This proves it is a real image, applies EXIF rotation, and drops all
 * metadata, including the GPS coordinates phones embed, which would otherwise expose a reporter's home.
 */
/** Image decoding is CPU-heavy; at most two run at once so a burst of uploads cannot starve the API. */
class Gate {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(task: () => Promise<T>): Promise<T> {
    // A finishing task hands its slot straight to the next waiter, so the limit is never exceeded.
    if (this.active < this.max) this.active += 1;
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}
const gate = new Gate(2);

export function processImage(input: Buffer): Promise<ProcessedImage> {
  return gate.run(() => decodeAndReencode(input));
}

async function decodeAndReencode(input: Buffer): Promise<ProcessedImage> {
  if (!sniffImage(input)) {
    throw AppError.badRequest(
      "UNSUPPORTED_FILE_TYPE",
      "Only JPEG, PNG or WebP photographs can be uploaded."
    );
  }
  try {
    const base = () => sharp(input, { failOn: "error", limitInputPixels: 60_000_000 }).rotate();
    const full = await base()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base()
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    return {
      full: full.data,
      thumb,
      width: full.info.width,
      height: full.info.height,
      sha256: createHash("sha256").update(full.data).digest("hex")
    };
  } catch {
    throw AppError.badRequest(
      "CORRUPT_IMAGE",
      "That file could not be read as an image. Try exporting it again."
    );
  }
}
