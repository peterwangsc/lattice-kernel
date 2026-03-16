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

    async infer(request: InferRequest): Promise<InferResponse> {
      // Stub: echo response for development/testing
      return {
        output: `[local stub] ${request.input}`,
        modelId: request.modelId,
        durationMs: 0,
      };
    },

    async embed(_request: EmbedRequest): Promise<EmbedResponse> {
      // Stub: zero embedding for development/testing
      return {
        embedding: new Array(384).fill(0) as number[],
        modelId: "local-stub",
        dimensions: 384,
      };
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
