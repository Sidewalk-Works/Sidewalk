import type { StellarConfig } from "../types/index.js";

/**
 * Placeholder interface for the future Stellar client.
 * Implementations will be added when blockchain functionality is in scope.
 */
export interface StellarClient {
  readonly config: StellarConfig;
}
