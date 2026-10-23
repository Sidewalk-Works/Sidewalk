import clsx from "clsx";
import Image from "next/image";
import { creditLine, type Photo } from "@/lib/photos";

interface Props {
  photo: Photo;
  sizes: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  /** Extra framing for the caption. Editorial photos are always labelled as illustrative. */
  caption?: string;
}

/**
 * Editorial photography is real and licensed, but it is not evidence. The caption says so every time,
 * so nobody mistakes a stock photo for a documented report.
 */
export function Photo({ photo, sizes, priority, className, imgClassName, caption }: Props) {
  return (
    <figure className={clsx("group", className)}>
      <div className="overflow-hidden bg-paper-deep">
        <Image
          src={photo.file}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          sizes={sizes}
          priority={priority}
          className={clsx("h-full w-full object-cover", imgClassName)}
        />
      </div>
      <figcaption className="mt-2 text-[0.8125rem] leading-snug text-muted">
        {caption ?? "Illustrative photograph, not a report made on Sidewalk."}{" "}
        <a
          href={photo.source}
          className="underline decoration-rule underline-offset-2 hover:decoration-ink"
          rel="noopener noreferrer"
          target="_blank"
        >
          {creditLine(photo)}
        </a>
      </figcaption>
    </figure>
  );
}
