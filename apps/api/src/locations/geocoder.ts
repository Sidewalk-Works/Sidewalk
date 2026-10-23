export const GEOCODER = Symbol("GEOCODER");

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  /** Neighbourhood, LGA or state, when the provider supplies it. */
  area: string | null;
}

export interface Geocoder {
  readonly enabled: boolean;
  search(query: string): Promise<GeocodeResult[]>;
  reverse(latitude: number, longitude: number): Promise<GeocodeResult | null>;
}
