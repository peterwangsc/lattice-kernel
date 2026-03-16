import type { BackendAdapter } from "@lattice-kernel/schemas";

export type CloudAdapter = BackendAdapter;

export interface CloudAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  provider: string;
}
