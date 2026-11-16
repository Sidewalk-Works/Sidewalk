/**
 * Placeholder type definitions for the future Stellar integration.
 * No blockchain functionality is implemented yet.
 */
export type StellarNetwork = "testnet" | "mainnet";

export interface StellarConfig {
  network: StellarNetwork;
}
