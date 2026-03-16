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

    async infer(request: InferRequest): Promise<InferResponse> {
      return {
        output: `[web stub] ${request.input}`,
        modelId: request.modelId,
        durationMs: 0,
      };
    },

    async embed(_request: EmbedRequest): Promise<EmbedResponse> {
      return {
        embedding: new Array(384).fill(0) as number[],
        modelId: "web-stub",
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
