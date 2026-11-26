"use client";

import { useCallback } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { BaseMap } from "@/components/map/base-map";

/** A small read-only map with a single pin on the report's real coordinates. */
export function LocationMap({
  latitude,
  longitude,
  title
}: {
  latitude: number;
  longitude: number;
  title: string;
}) {
  const onReady = useCallback(
    (map: MapLibreMap, lib: typeof import("maplibre-gl")) => {
      const el = document.createElement("div");
      el.className = "size-5 rounded-full border-[3px] border-white bg-laterite shadow-lift";
      new lib.Marker({ element: el }).setLngLat([longitude, latitude]).addTo(map);
      map.resize();
    },
    [latitude, longitude]
  );
  return (
    <BaseMap
      className="h-64 w-full border-2 border-ink"
      ariaLabel={`Map showing the location of: ${title}. Coordinates ${latitude.toFixed(5)}, ${longitude.toFixed(5)}.`}
      center={{ latitude, longitude, zoom: 15 }}
      onReady={onReady}
    />
  );
}
