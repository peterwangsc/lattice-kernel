import type {
  BackendCapabilities,
  InferRequest,
  InferResponse,
  InferStreamChunk,
  EmbedRequest,
  EmbedResponse,
  CostEstimate,
  ModelDescriptor,
  BackendAdapter,
} from "@lattice-kernel/schemas";
import { AdapterError } from "@lattice-kernel/schemas";

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
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: string;
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
      throw new AdapterError(
        "cloud:anthropic",
        `Anthropic API error (${response.status}): ${errorBody}`,
        response.status,
      );
    }

    return response.json();
  }

  function buildRequestBody(
    request: InferRequest,
    model: string,
  ): Record<string, unknown> {
    // Build messages array — handle tool_result role specially for Anthropic
    const messages =
      request.messages && request.messages.length > 0
        ? request.messages.map((m) => {
            if (m.role === "tool_result" && m.toolUseId) {
              return {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: m.toolUseId,
                    content: m.content,
                  },
                ],
              };
            }
            return { role: m.role, content: m.content };
          })
        : [{ role: "user", content: request.input }];

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? 1024,
      messages,
    };

    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.stopSequences && request.stopSequences.length > 0) {
      body.stop_sequences = request.stopSequences;
    }
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }

    return body;
  }

  return {
    providerId: "cloud:anthropic",

    async getCapabilities(): Promise<BackendCapabilities> {
      return {
        supportsLocalExecution: false,
        supportsCloudExecution: true,
        supportsAdaptation: false,
        supportsStreaming: true,
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

      const body = buildRequestBody(request, model);

      const result = (await callApi(
        "/v1/messages",
        body,
      )) as AnthropicMessageResponse;

      const textContent = result.content.find((c) => c.type === "text");
      const output = textContent?.text ?? "";

      // Extract tool use requests
      const toolUseBlocks = result.content.filter(
        (c) => c.type === "tool_use",
      );
      const toolUseRequests =
        toolUseBlocks.length > 0
          ? toolUseBlocks.map((c) => ({
              id: c.id!,
              name: c.name!,
              input: c.input ?? {},
            }))
          : undefined;

      // Map Anthropic stop reasons to our enum
      const stopReasonMap: Record<string, "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"> = {
        end_turn: "end_turn",
        max_tokens: "max_tokens",
        tool_use: "tool_use",
        stop_sequence: "stop_sequence",
      };

      return {
        output,
        modelId: result.model,
        tokensUsed: result.usage.input_tokens + result.usage.output_tokens,
        durationMs: Date.now() - startMs,
        toolUseRequests,
        stopReason: stopReasonMap[result.stop_reason],
      };
    },

    async *inferStream(request: InferRequest): AsyncIterable<InferStreamChunk> {
      const model =
        request.modelId === "default" ? defaultModel : request.modelId;

      const body = buildRequestBody(request, model);
      body.stream = true;

      const url = `${baseUrl}/v1/messages`;
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

      if (!response.body) {
        throw new AdapterError("cloud:anthropic", "No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let totalTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data) as Record<string, unknown>;
              const eventType = event.type as string;

              if (eventType === "content_block_delta") {
                const delta = event.delta as { type: string; text?: string };
                if (delta.type === "text_delta" && delta.text) {
                  yield { type: "text_delta", text: delta.text };
                }
              } else if (eventType === "message_delta") {
                const usage = event.usage as
                  | { output_tokens: number }
                  | undefined;
                if (usage) {
                  totalTokens += usage.output_tokens;
                }
              } else if (eventType === "message_stop") {
                yield {
                  type: "usage",
                  tokensUsed: totalTokens,
                  modelId: model,
                };
                yield { type: "done" };
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },

    async embed(_request: EmbedRequest): Promise<EmbedResponse> {
      throw new AdapterError(
        "cloud:anthropic",
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
