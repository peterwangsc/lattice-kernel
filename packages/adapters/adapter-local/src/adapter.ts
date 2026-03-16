import type {
  BackendCapabilities,
  InferRequest,
  InferResponse,
  EmbedRequest,
  EmbedResponse,
  CostEstimate,
  ModelDescriptor,
} from "@lattice-kernel/schemas";
import type { LocalAdapter, LocalAdapterConfig } from "./types.js";

export function createLocalAdapter(_config: LocalAdapterConfig = {}): LocalAdapter {
  return {
    providerId: "local",

    async getCapabilities(): Promise<BackendCapabilities> {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportedFormats: ["gguf", "onnx"],
      };
    },

    async listModels(): Promise<ModelDescriptor[]> {
      return [];
    },

    async infer(_request: InferRequest): Promise<InferResponse> {
      throw new Error("Local inference not yet implemented");
    },

    async embed(_request: EmbedRequest): Promise<EmbedResponse> {
      throw new Error("Local embedding not yet implemented");
    },

    async estimate(_request: InferRequest): Promise<CostEstimate> {
      return {
        estimatedLatencyMs: 0,
        estimatedCost: 0,
      };
    },

    async healthCheck(): Promise<boolean> {
      return true;
    },
  };
}
