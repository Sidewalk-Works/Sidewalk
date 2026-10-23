import credits from "../../public/photography/credits.json";

export interface Photo {
  slug: string;
  file: string;
  width: number;
  height: number;
  alt: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  source: string;
}

const all = credits as Photo[];
export const photos = Object.fromEntries(all.map((p) => [p.slug, p])) as Record<string, Photo>;
export const allPhotos = all;

/** Short credit line shown beside editorial photography. */
export const creditLine = (p: Photo) => `${p.author}, ${p.license}`;
