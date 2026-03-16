import type { BackendAdapter } from "@lattice-kernel/schemas";

export type LocalAdapter = BackendAdapter;

export interface LocalAdapterConfig {
  modelsDir?: string;
}
