import { Logger } from "@nestjs/common";
import { AppError } from "../common/app-error";
import type { AppEnv } from "../config/env";
import type { Geocoder, GeocodeResult } from "./geocoder";

interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

/**
 * Nominatim (OpenStreetMap) geocoder. The public instance allows at most one request per second and
 * requires an identifying User-Agent, so calls are spaced out and cached. Production should use
 * its own instance or a commercial provider via GEOCODER_BASE_URL (enforced at startup).
 */
export class NominatimGeocoder implements Geocoder {
  readonly enabled = true;
  private readonly logger = new Logger("Geocoder");
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private nextSlot = 0;

  constructor(private readonly env: AppEnv) {}

  async search(query: string): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "6",
      countrycodes: this.env.GEOCODER_COUNTRY_CODES
    });
    const items = await this.fetchCached<NominatimItem[]>(`/search?${params}`);
    return items.map((i) => this.toResult(i)).filter((r): r is GeocodeResult => r !== null);
  }

  async reverse(latitude: number, longitude: number): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({
      lat: latitude.toFixed(5),
      lon: longitude.toFixed(5),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "17"
    });
    const item = await this.fetchCached<NominatimItem & { error?: string }>(`/reverse?${params}`);
    return item.error ? null : this.toResult(item, latitude, longitude);
  }

  private toResult(i: NominatimItem, lat?: number, lon?: number): GeocodeResult | null {
    const latitude = lat ?? Number(i.lat);
    const longitude = lon ?? Number(i.lon);
    if (!i.display_name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const a = i.address ?? {};
    const area = [
      a.suburb ?? a.neighbourhood ?? a.village ?? a.town ?? a.city_district,
      a.city ?? a.county ?? a.state
    ]
      .filter(Boolean)
      .join(", ");
    return { label: i.display_name, latitude, longitude, area: area || null };
  }

  private async fetchCached<T>(pathAndQuery: string): Promise<T> {
    const hit = this.cache.get(pathAndQuery);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value as T;

    // Reserve a one-second slot; callers wait their turn instead of being refused by the upstream service.
    const wait = Math.max(0, this.nextSlot - Date.now());
    this.nextSlot = Date.now() + wait + 1100;
    if (wait > 4000)
      throw new AppError(
        429,
        "GEOCODER_BUSY",
        "Location search is busy. Try again in a moment, or place the pin on the map."
      );
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    try {
      const res = await fetch(`${this.env.GEOCODER_BASE_URL}${pathAndQuery}`, {
        headers: {
          "User-Agent": `Sidewalk/0.1 (${this.env.GEOCODER_CONTACT})`,
          "Accept-Language": "en"
        },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) throw new Error(`Upstream status ${res.status}`);
      const value = (await res.json()) as T;
      if (this.cache.size > 500) this.cache.clear();
      this.cache.set(pathAndQuery, { at: Date.now(), value });
      return value;
    } catch (e) {
      // The name only: a message can echo the request, which holds what the resident searched for.
      this.logger.warn(`Geocoder request failed: ${(e as Error).name}`);
      throw new AppError(
        503,
        "GEOCODER_UNAVAILABLE",
        "Location search is unavailable right now. Place the pin on the map or enter coordinates instead."
      );
    }
  }
}

export class DisabledGeocoder implements Geocoder {
  readonly enabled = false;
  async search(): Promise<GeocodeResult[]> {
    throw new AppError(
      503,
      "GEOCODER_UNAVAILABLE",
      "Location search is not configured. Place the pin on the map or enter coordinates instead."
    );
  }
  async reverse(): Promise<GeocodeResult | null> {
    return null;
  }
}
