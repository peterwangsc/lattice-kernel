import type { BackendAdapter } from "@lattice-kernel/schemas";

export type WebAdapter = BackendAdapter;

export interface WebAdapterConfig {
  workerUrl?: string;
}
