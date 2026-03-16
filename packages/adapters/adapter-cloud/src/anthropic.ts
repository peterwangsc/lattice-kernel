import type {
  BackendCapabilities,
  InferRequest,
  InferResponse,
  EmbedRequest,
  EmbedResponse,
  CostEstimate,
  ModelDescriptor,
  BackendAdapter,
} from "@lattice-kernel/schemas";

export interface AnthropicAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  maxRetries?: number;
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

const ANTHROPIC_MODELS: ModelDescriptor[] = [
  {
    id: "claude-sonnet-4-6",
    version: "claude-sonnet-4-6-20250514",
    provider: "anthropic",
    format: "api",
    capabilities: {
      supportsEmbedding: false,
      supportsToolCalling: true,
      supportsAdaptation: false,
      supportsMultimodal: true,
    },
    executionTargets: ["cloud"],
    policyTags: ["general", "anthropic"],
  },
  {
    id: "claude-haiku-4-5",
    version: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    format: "api",
    capabilities: {
      supportsEmbedding: false,
      supportsToolCalling: true,
      supportsAdaptation: false,
      supportsMultimodal: true,
    },
    executionTargets: ["cloud"],
    policyTags: ["general", "anthropic", "fast"],
  },
];

interface AnthropicMessageResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text?: string }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export function createAnthropicAdapter(
  config: AnthropicAdapterConfig,
): BackendAdapter {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const defaultModel = config.defaultModel ?? "claude-sonnet-4-6";

  async function callApi(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Anthropic API error (${response.status}): ${errorBody}`,
      );
    }

    return response.json();
  }

  return {
    providerId: "cloud:anthropic",

    async getCapabilities(): Promise<BackendCapabilities> {
      return {
        supportsLocalExecution: false,
        supportsCloudExecution: true,
        supportsAdaptation: false,
        supportedFormats: ["api"],
      };
    },

    async listModels(): Promise<ModelDescriptor[]> {
      return ANTHROPIC_MODELS;
    },

    async infer(request: InferRequest): Promise<InferResponse> {
      const model =
        request.modelId === "default" ? defaultModel : request.modelId;
      const startMs = Date.now();

      const body: Record<string, unknown> = {
        model,
        max_tokens: request.maxTokens ?? 1024,
        messages: [{ role: "user", content: request.input }],
      };

      if (request.temperature !== undefined) {
        body.temperature = request.temperature;
      }
      if (request.stopSequences && request.stopSequences.length > 0) {
        body.stop_sequences = request.stopSequences;
      }

      const result = (await callApi(
        "/v1/messages",
        body,
      )) as AnthropicMessageResponse;

      const textContent = result.content.find((c) => c.type === "text");
      const output = textContent?.text ?? "";

      return {
        output,
        modelId: result.model,
        tokensUsed: result.usage.input_tokens + result.usage.output_tokens,
        durationMs: Date.now() - startMs,
      };
    },

    async embed(_request: EmbedRequest): Promise<EmbedResponse> {
      throw new Error(
        "Anthropic does not provide an embedding API. Use a dedicated embedding provider.",
      );
    },

    async estimate(request: InferRequest): Promise<CostEstimate> {
      // Rough estimate based on typical token counts
      const estimatedInputTokens = Math.ceil(request.input.length / 4);
      const estimatedOutputTokens = request.maxTokens ?? 1024;
      return {
        estimatedTokens: estimatedInputTokens + estimatedOutputTokens,
        estimatedLatencyMs: 2000,
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        // Minimal API call to verify credentials
        await callApi("/v1/messages", {
          model: defaultModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
