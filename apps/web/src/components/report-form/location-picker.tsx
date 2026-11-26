"use client";

import { LocateFixed, Search } from "lucide-react";
import Link from "next/link";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Paginated, ReportSummaryDto } from "@sidewalk/contracts";
import { BaseMap } from "@/components/map/base-map";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/client-api";

export interface PickedLocation {
  latitude: number | null;
  longitude: number | null;
  areaName?: string;
}

interface GeocodeItem {
  label: string;
  latitude: number;
  longitude: number;
  area: string | null;
}

interface Props {
  value: PickedLocation;
  onChange: (next: PickedLocation) => void;
  errorMessage?: string;
  /** Used to look for reports that may already cover this spot. */
  categorySlug?: string;
  excludeReference?: string;
}

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Three equal ways to say where: click or drag on the map, search for a place, or type coordinates.
 * Only the first needs a pointer, so keyboard and screen reader users are never blocked by the map.
 */
export function LocationPicker({
  value,
  onChange,
  errorMessage,
  categorySlug,
  excludeReference
}: Props) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeItem[] | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);
  const [latText, setLatText] = useState(value.latitude?.toString() ?? "");
  const [lngText, setLngText] = useState(value.longitude?.toString() ?? "");
  const [nearby, setNearby] = useState<ReportSummaryDto[]>([]);

  /** Reports a new position to the form. Typed coordinates are left as typed; other sources rewrite the fields. */
  const commit = useCallback((lat: number, lng: number, area?: string, syncText = true) => {
    if (syncText) {
      setLatText(lat.toFixed(6));
      setLngText(lng.toFixed(6));
    }
    onChangeRef.current({
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      areaName: area ?? valueRef.current.areaName
    });
  }, []);

  const place = useCallback(
    (lat: number, lng: number, area?: string, fly = false, syncText = true) => {
      const map = mapRef.current;
      const lib = libRef.current;
      if (map && lib) {
        if (!markerRef.current) {
          const el = document.createElement("div");
          el.className =
            "size-6 rounded-full border-[3px] border-white bg-laterite shadow-lift cursor-grab";
          const marker = new lib.Marker({ element: el, draggable: true })
            .setLngLat([lng, lat])
            .addTo(map);
          marker.on("dragend", () => {
            const p = marker.getLngLat();
            commit(p.lat, p.lng);
          });
          markerRef.current = marker;
        } else {
          markerRef.current.setLngLat([lng, lat]);
        }
        if (fly)
          map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 700 });
      }
      commit(lat, lng, area, syncText);
    },
    [commit]
  );

  const onReady = useCallback(
    (map: MapLibreMap, lib: typeof import("maplibre-gl")) => {
      mapRef.current = map;
      libRef.current = lib;
      const v = valueRef.current;
      if (v.latitude !== null && v.longitude !== null)
        place(v.latitude, v.longitude, undefined, false);
      map.on("click", (e) => place(e.lngLat.lat, e.lngLat.lng));
      map.getCanvas().style.cursor = "crosshair";
      return () => {
        markerRef.current?.remove();
        markerRef.current = null;
      };
    },
    [place]
  );

  async function search() {
    if (query.trim().length < 3) return setSearchMsg("Type at least three characters.");
    setSearching(true);
    setSearchMsg(null);
    setResults(null);
    try {
      const res = await api<{ items: GeocodeItem[] }>(
        `/locations/search?q=${encodeURIComponent(query.trim())}`
      );
      setResults(res.items);
      if (res.items.length === 0)
        setSearchMsg("No places found. Try a nearby landmark, or click the map.");
    } catch (e) {
      setSearchMsg((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function applyTypedCoordinates(lat: string, lng: string) {
    const la = Number(lat);
    const ln = Number(lng);
    if (lat.trim() !== "" && lng.trim() !== "" && valid(la, ln))
      place(la, ln, undefined, true, false);
  }

  // Look for existing reports within 300 m so people can add to them rather than duplicate them.
  useEffect(() => {
    const { latitude, longitude } = value;
    if (latitude === null || longitude === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams({
        near: `${latitude},${longitude}`,
        radiusKm: "0.3",
        pageSize: "4"
      });
      if (categorySlug) params.set("category", categorySlug);
      api<Paginated<ReportSummaryDto>>(`/reports?${params}`, { signal: ctrl.signal })
        .then((r) => setNearby(r.items.filter((i) => i.reference !== excludeReference)))
        .catch(() => undefined);
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, categorySlug, excludeReference]);

  const start =
    value.latitude !== null && value.longitude !== null
      ? { latitude: value.latitude, longitude: value.longitude, zoom: 16 }
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-semibold">Find the spot</p>
        <p className="mt-1 text-[0.9rem] text-muted">
          Search for a street or landmark, click or tap the map, or enter coordinates. Drag the pin
          to fine-tune it.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Search for a place">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Ogunlana Drive, Surulere"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
          </Field>
        </div>
        <Button
          variant="secondary"
          onClick={() => void search()}
          loading={searching}
          icon={<Search className="size-4" aria-hidden />}
        >
          Search
        </Button>
        <Button
          variant="secondary"
          icon={<LocateFixed className="size-4" aria-hidden />}
          loading={locating === "busy"}
          onClick={() => {
            if (!navigator.geolocation)
              return setLocating("Your browser cannot share its location.");
            setLocating("busy");
            navigator.geolocation.getCurrentPosition(
              (p) => {
                setLocating(null);
                place(p.coords.latitude, p.coords.longitude, undefined, true);
              },
              () => setLocating("We could not get your location. Search or click the map instead."),
              { enableHighAccuracy: true, timeout: 12_000 }
            );
          }}
        >
          Use my location
        </Button>
      </div>
      {locating && locating !== "busy" && (
        <p role="alert" className="text-[0.9rem] text-danger">
          {locating}
        </p>
      )}
      <div aria-live="polite">
        {searchMsg && (
          <p className="border-l-4 border-signal bg-signal-wash px-3 py-2 text-[0.9rem]">
            {searchMsg}
          </p>
        )}
        {results && results.length > 0 && (
          <ul className="border-2 border-ink bg-surface">
            {results.map((r) => (
              <li
                key={`${r.latitude},${r.longitude}`}
                className="border-b border-rule last:border-0"
              >
                <button
                  type="button"
                  className="block min-h-11 w-full px-4 py-2.5 text-left text-[0.925rem] hover:bg-paper-deep"
                  onClick={() => {
                    place(r.latitude, r.longitude, r.area ?? undefined, true);
                    setResults(null);
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-2 border-ink">
        <BaseMap
          className="h-[22rem] w-full sm:h-[26rem]"
          ariaLabel="Map for choosing the location. Click or tap to place the pin, or use the search and coordinate fields instead."
          center={start}
          onReady={onReady}
        />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Coordinates</legend>
        <Field label="Latitude" hint="Between -90 and 90">
          <Input
            inputMode="decimal"
            value={latText}
            onChange={(e) => (
              setLatText(e.target.value),
              applyTypedCoordinates(e.target.value, lngText)
            )}
            placeholder="6.524400"
          />
        </Field>
        <Field label="Longitude" hint="Between -180 and 180">
          <Input
            inputMode="decimal"
            value={lngText}
            onChange={(e) => (
              setLngText(e.target.value),
              applyTypedCoordinates(latText, e.target.value)
            )}
            placeholder="3.379200"
          />
        </Field>
      </fieldset>
      {errorMessage && (
        <p role="alert" className="text-[0.95rem] font-semibold text-danger">
          {errorMessage}
        </p>
      )}
      {value.latitude !== null && (
        <p className="text-[0.9rem] text-muted" aria-live="polite">
          Pin placed at {value.latitude.toFixed(5)}, {value.longitude?.toFixed(5)}.
        </p>
      )}

      {value.latitude !== null && nearby.length > 0 && (
        <div className="border-l-4 border-signal bg-signal-wash p-4" aria-live="polite">
          <p className="font-semibold">
            Is it one of these? Similar reports already exist within 300 m.
          </p>
          <ul className="mt-2 space-y-1.5 text-[0.925rem]">
            {nearby.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/issues/${r.reference}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link font-semibold"
                >
                  {r.title}
                </Link>{" "}
                <span className="font-mono text-[0.8rem] text-muted">{r.reference}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.85rem]">
            If yours is the same problem, add a comment or photograph there instead. If it is
            different, carry on.
          </p>
        </div>
      )}
    </div>
  );
}
