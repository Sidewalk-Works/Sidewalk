"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { DEFAULT_MAP_CENTER } from "@sidewalk/contracts";
import { mapStyle } from "./map-style";

type MapLib = typeof import("maplibre-gl");

const WORKER_URL = "/vendor/maplibre/maplibre-gl-worker.mjs";

interface Props {
  className?: string;
  ariaLabel: string;
  center?: { latitude: number; longitude: number; zoom: number };
  /** Called once the map has loaded. Return a cleanup function if you add listeners or layers. */
  onReady: (map: MapLibreMap, lib: MapLib) => void | (() => void);
  geolocate?: boolean;
}

/** Thin MapLibre wrapper: lazy-loads the library on the client and tears the map down cleanly. */
export function BaseMap({ className, ariaLabel, center, onReady, geolocate }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  });

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let cleanup: void | (() => void);
    let cancelled = false;
    const start = center ?? DEFAULT_MAP_CENTER;

    import("maplibre-gl").then((lib) => {
      if (cancelled || !container.current) return;
      // Served from our own origin (see next.config.ts), so the Content-Security-Policy can stay strict.
      lib.setWorkerUrl(WORKER_URL);
      const m = new lib.Map({
        container: container.current,
        style: mapStyle,
        center: [start.longitude, start.latitude],
        zoom: start.zoom,
        maxZoom: 18,
        attributionControl: { compact: true },
        cooperativeGestures: true
      });
      map = m;
      m.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
      if (geolocate)
        m.addControl(
          new lib.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: false
          }),
          "top-right"
        );
      m.on("load", () => {
        if (!cancelled) cleanup = readyRef.current(m, lib);
      });
    });

    return () => {
      cancelled = true;
      if (typeof cleanup === "function") cleanup();
      map?.remove();
    };
    // The map is created once; props that change later are handled through onReady's closure refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={container} className={className} role="region" aria-label={ariaLabel} />;
}
