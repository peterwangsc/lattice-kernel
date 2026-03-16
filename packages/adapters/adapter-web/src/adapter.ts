import type {
  BackendCapabilities,
  InferRequest,
  InferResponse,
  EmbedRequest,
  EmbedResponse,
  CostEstimate,
  ModelDescriptor,
} from "@lattice-kernel/schemas";
import type { WebAdapter, WebAdapterConfig } from "./types.js";

export function createWebAdapter(_config: WebAdapterConfig = {}): WebAdapter {
  return {
    providerId: "web",

    async getCapabilities(): Promise<BackendCapabilities> {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportedFormats: ["onnx-web"],
      };
    },

    async listModels(): Promise<ModelDescriptor[]> {
      return [];
    },

    async infer(_request: InferRequest): Promise<InferResponse> {
      throw new Error("Web inference not yet implemented");
    },

    async embed(_request: EmbedRequest): Promise<EmbedResponse> {
      throw new Error("Web embedding not yet implemented");
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
