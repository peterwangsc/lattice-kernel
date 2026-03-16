import { AdapterError } from "@lattice-kernel/schemas";
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

    async infer(_request: InferRequest): Promise<InferResponse> {
      throw new AdapterError("cloud:generic", "Cloud inference not yet implemented");
    },

    async embed(_request: EmbedRequest): Promise<EmbedResponse> {
      throw new AdapterError("cloud:generic", "Cloud embedding not yet implemented");
    },

    async estimate(_request: InferRequest): Promise<CostEstimate> {
      return {};
    },

    async healthCheck(): Promise<boolean> {
      return config.apiKey !== undefined;
    },
  };
}
