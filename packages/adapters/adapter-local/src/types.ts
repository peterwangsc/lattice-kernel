import type { ModelDescriptor } from "@lattice-kernel/schemas";

export interface LocalAdapter {
  listModels(): Promise<ModelDescriptor[]>;
  infer(modelId: string, input: string): Promise<string>;
  embed(modelId: string, content: string): Promise<number[]>;
  healthCheck(): Promise<boolean>;
}
