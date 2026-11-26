import type { Metadata } from "next";
import Image from "next/image";
import { Block, PageShell } from "@/components/content/page-shell";
import { allPhotos } from "@/lib/photos";

export const metadata: Metadata = { title: "Photo credits" };

export default function CreditsPage() {
  return (
    <PageShell
      eyebrow="Photo credits"
      title="The photographs on this site"
      intro="Editorial photographs are real, openly licensed images of Nigerian streets, sourced from Wikimedia Commons. They illustrate everyday infrastructure. They are never evidence of a report made on Sidewalk."
    >
      <Block id="list" heading="Credits">
        <ul className="not-prose space-y-8">
          {allPhotos.map((p) => (
            <li key={p.slug} className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Image
                src={p.file}
                alt={p.alt}
                width={p.width}
                height={p.height}
                sizes="160px"
                className="aspect-[4/3] w-40 object-cover"
              />
              <div className="text-[0.95rem]">
                <p className="font-semibold">{p.title}</p>
                <p className="mt-1 text-muted">{p.alt}</p>
                <p className="mt-2">
                  By {p.author}. Licence:{" "}
                  {p.licenseUrl ? (
                    <a href={p.licenseUrl} className="link" rel="noopener noreferrer">
                      {p.license}
                    </a>
                  ) : (
                    p.license
                  )}
                  .{" "}
                  <a href={p.source} className="link" rel="noopener noreferrer">
                    Source on Wikimedia Commons
                  </a>
                  . Resized and compressed for the web.
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Block>
      <Block id="map" heading="Map data">
        <p>
          Maps use OpenStreetMap data, © OpenStreetMap contributors, available under the Open
          Database Licence.
        </p>
      </Block>
    </PageShell>
  );
}
