import type { StyleSpecification } from "maplibre-gl";

export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors";

/** Raster OpenStreetMap-compatible style. No API key is needed; swap NEXT_PUBLIC_MAP_TILE_URL for any XYZ provider. */
export const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: "raster",
      tiles: [TILE_URL],
      tileSize: 256,
      attribution: ATTRIBUTION,
      maxzoom: 19
    }
  },
  layers: [{ id: "base", type: "raster", source: "base" }]
};
