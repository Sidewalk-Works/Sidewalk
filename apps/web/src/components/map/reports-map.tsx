"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  REPORT_STATUSES,
  STATUS_INFO,
  type MapPointDto,
  type ReportStatus
} from "@sidewalk/contracts";
import { api } from "@/lib/client-api";
import { STATUS_STYLE } from "@/lib/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { BaseMap } from "./base-map";

interface Props {
  /** Query string of the active filters (q, category, status). */
  filterQuery: string;
}

interface MapResponse {
  items: MapPointDto[];
  total: number;
  truncated: boolean;
}

const toGeoJson = (items: MapPointDto[]) => ({
  type: "FeatureCollection" as const,
  features: items.map((p) => ({
    type: "Feature" as const,
    properties: {
      reference: p.reference,
      title: p.title,
      status: p.status,
      color: STATUS_STYLE[p.status].hex
    },
    geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] }
  }))
});

/** Map of real report coordinates, plus the same data as a list so the map is never the only way in. */
export function ReportsMap({ filterQuery }: Props) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedOnce = useRef(false);
  const truncatedRef = useRef(false);
  const queryRef = useRef(filterQuery);
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (bbox?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(queryRef.current);
      if (bbox) params.set("bbox", bbox);
      const res = await api<MapResponse>(`/reports/map?${params}`);
      setData(res);
      truncatedRef.current = res.truncated;
      const map = mapRef.current;
      (map?.getSource("reports") as GeoJSONSource | undefined)?.setData(toGeoJson(res.items));
      if (map && !loadedOnce.current && !bbox && res.items.length > 0) {
        loadedOnce.current = true;
        const lngs = res.items.map((p) => p.longitude);
        const lats = res.items.map((p) => p.latitude);
        const first = res.items[0] as MapPointDto;
        if (res.items.length === 1)
          map.jumpTo({ center: [first.longitude, first.latitude], zoom: 14 });
        else
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            ],
            { padding: 56, maxZoom: 14, duration: 0 }
          );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Filters changed (the page re-rendered with a new query): refetch.
  useEffect(() => {
    queryRef.current = filterQuery;
    loadedOnce.current = false;
    if (mapRef.current) void load();
  }, [filterQuery, load]);

  const onReady = useCallback(
    (map: MapLibreMap, lib: typeof import("maplibre-gl")) => {
      mapRef.current = map;
      map.addSource("reports", { type: "geojson", data: toGeoJson([]) });
      map.addLayer({
        id: "report-points",
        type: "circle",
        source: "reports",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5, 12, 9, 16, 12],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5
        }
      });
      const popup = new lib.Popup({ closeButton: true, maxWidth: "280px", offset: 14 });
      map.on("click", "report-points", (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        const { reference, title, status } = f.properties as {
          reference: string;
          title: string;
          status: ReportStatus;
        };
        const el = document.createElement("div");
        const label = document.createElement("p");
        label.className = "eyebrow";
        label.textContent = `${STATUS_INFO[status].label} · ${reference}`;
        const link = document.createElement("a");
        link.href = `/issues/${reference}`;
        link.textContent = title;
        link.className = "mt-1 block font-semibold underline";
        el.append(label, link);
        popup
          .setLngLat(f.geometry.coordinates as [number, number])
          .setDOMContent(el)
          .addTo(map);
      });
      map.on("mouseenter", "report-points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "report-points", () => (map.getCanvas().style.cursor = ""));
      // With a very busy city the API returns only the most active 500, so narrow to what is on screen.
      let timer: ReturnType<typeof setTimeout>;
      map.on("moveend", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!truncatedRef.current) return;
          const b = map.getBounds();
          void load(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
        }, 400);
      });
      void load();
      return () => clearTimeout(timer);
    },
    [load]
  );

  return (
    <div>
      <div className="relative border-2 border-ink">
        <BaseMap
          className="h-[26rem] w-full sm:h-[32rem]"
          ariaLabel="Map of public reports. A list of the same reports follows the map."
          onReady={onReady}
          geolocate
        />
        {loading && (
          <p className="absolute left-3 top-3 border border-ink bg-surface px-3 py-1.5 text-[0.8125rem] font-semibold shadow-lift">
            Loading reports…
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="absolute inset-x-3 bottom-3 border-l-4 border-danger bg-danger-wash px-3 py-2 text-[0.9rem] font-medium"
          >
            {error}{" "}
            <button type="button" className="underline" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem]" aria-label="Map legend">
        {REPORT_STATUSES.filter((s) => s !== "DUPLICATE").map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`size-3 ${STATUS_STYLE[s].swatch}`} aria-hidden />
            {STATUS_INFO[s].label}
          </li>
        ))}
      </ul>

      <section aria-labelledby="map-list" className="mt-10">
        <h2 id="map-list" className="display-md">
          Reports shown on the map
        </h2>
        <p className="mt-1 text-muted" aria-live="polite">
          {data
            ? data.total === 0
              ? "No reports match these filters."
              : `${data.items.length}${data.truncated ? ` of ${data.total}` : ""} reports. ${data.truncated ? "Zoom in to see more." : ""}`
            : "Loading…"}
        </p>
        {data && data.items.length > 0 && (
          <ol className="mt-5 grid gap-x-10 border-t-2 border-ink md:grid-cols-2">
            {data.items.slice(0, 60).map((p) => (
              <li
                key={p.reference}
                className="flex items-start justify-between gap-4 border-b border-rule py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/issues/${p.reference}`}
                    className="font-semibold underline decoration-laterite decoration-2 underline-offset-4"
                  >
                    {p.title}
                  </Link>
                  <p className="mt-0.5 font-mono text-[0.8rem] text-muted">{p.reference}</p>
                </div>
                <StatusBadge status={p.status} className="shrink-0" />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
