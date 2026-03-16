import type {
  BackendCapabilities,
  InferRequest,
  InferResponse,
  EmbedRequest,
  EmbedResponse,
  CostEstimate,
  ModelDescriptor,
} from "@lattice-kernel/schemas";
import type { CloudAdapter, CloudAdapterConfig } from "./types.js";

export function createCloudAdapter(config: CloudAdapterConfig): CloudAdapter {
  return {
    providerId: `cloud:${config.provider}`,

    async getCapabilities(): Promise<BackendCapabilities> {
      return {
        supportsLocalExecution: false,
        supportsCloudExecution: true,
        supportsAdaptation: false,
        supportedFormats: [],
      };
    },

    async listModels(): Promise<ModelDescriptor[]> {
      return [];
    },

    async infer(request: InferRequest): Promise<InferResponse> {
      return {
        output: `[cloud:${config.provider} stub] ${request.input}`,
        modelId: request.modelId,
        durationMs: 0,
      };
    },

    async embed(_request: EmbedRequest): Promise<EmbedResponse> {
      return {
        embedding: new Array(384).fill(0) as number[],
        modelId: `cloud:${config.provider}-stub`,
        dimensions: 384,
      };
    },

    async estimate(_request: InferRequest): Promise<CostEstimate> {
      return {};
    },

    async healthCheck(): Promise<boolean> {
      return config.apiKey !== undefined;
    },
  };
}
