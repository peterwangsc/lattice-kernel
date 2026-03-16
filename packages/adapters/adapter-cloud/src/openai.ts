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

export interface OpenAIAdapterConfig {
  /** API key. Optional for local servers that don't require auth. */
  apiKey?: string;
  /** Base URL. Defaults to https://api.openai.com. Set to your local server URL for local LLMs. */
  baseUrl?: string;
  /** Default model ID. */
  defaultModel?: string;
  /** OpenAI organization header (only for OpenAI's API). */
  organization?: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com";

const OPENAI_MODELS: ModelDescriptor[] = [
  {
    id: "gpt-4o",
    version: "gpt-4o",
    provider: "openai",
    format: "api",
    capabilities: {
      supportsEmbedding: false,
      supportsToolCalling: true,
      supportsAdaptation: false,
      supportsMultimodal: true,
    },
    executionTargets: ["cloud"],
    policyTags: ["general", "openai"],
  },
  {
    id: "gpt-4o-mini",
    version: "gpt-4o-mini",
    provider: "openai",
    format: "api",
    capabilities: {
      supportsEmbedding: false,
      supportsToolCalling: true,
      supportsAdaptation: false,
      supportsMultimodal: true,
    },
    executionTargets: ["cloud"],
    policyTags: ["general", "openai", "fast"],
  },
  {
    id: "text-embedding-3-small",
    version: "text-embedding-3-small",
    provider: "openai",
    format: "api",
    capabilities: {
      supportsEmbedding: true,
      supportsToolCalling: false,
      supportsAdaptation: false,
      supportsMultimodal: false,
    },
    executionTargets: ["cloud"],
    policyTags: ["embedding", "openai"],
  },
];

interface OpenAIChatResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export function createOpenAIAdapter(
  config: OpenAIAdapterConfig,
): BackendAdapter {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const defaultModel = config.defaultModel ?? "gpt-4o";

  async function callApi(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    if (config.organization) {
      headers["OpenAI-Organization"] = config.organization;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AdapterError(
        "cloud:openai",
        `OpenAI API error (${response.status}): ${errorBody}`,
        response.status,
      );
    }

    return response.json();
  }

  function buildMessages(request: InferRequest): Array<Record<string, unknown>> {
    if (request.messages && request.messages.length > 0) {
      const msgs: Array<Record<string, unknown>> = [];
      if (request.systemPrompt) {
        msgs.push({ role: "system", content: request.systemPrompt });
      }
      for (const m of request.messages) {
        if (m.role === "tool_result" && m.toolUseId) {
          msgs.push({ role: "tool", content: m.content, tool_call_id: m.toolUseId });
        } else {
          msgs.push({ role: m.role, content: m.content });
        }
      }
      return msgs;
    }

    const msgs: Array<Record<string, unknown>> = [];
    if (request.systemPrompt) {
      msgs.push({ role: "system", content: request.systemPrompt });
    }
    msgs.push({ role: "user", content: request.input });
    return msgs;
  }

  return {
    providerId: baseUrl === DEFAULT_BASE_URL ? "cloud:openai" : `openai-compat:${new URL(baseUrl).host}`,

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
      return OPENAI_MODELS;
    },

    async infer(request: InferRequest): Promise<InferResponse> {
      const model = request.modelId === "default" ? defaultModel : request.modelId;
      const startMs = Date.now();

      const body: Record<string, unknown> = {
        model,
        messages: buildMessages(request),
        max_tokens: request.maxTokens ?? 1024,
      };

      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.stopSequences?.length) body.stop = request.stopSequences;
      if (request.tools?.length) {
        body.tools = request.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        }));
      }

      const result = (await callApi("/v1/chat/completions", body)) as OpenAIChatResponse;
      const choice = result.choices[0]!;
      const output = choice.message.content ?? "";

      const toolUseRequests = choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

      const stopReasonMap: Record<string, "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"> = {
        stop: "end_turn",
        length: "max_tokens",
        tool_calls: "tool_use",
      };

      return {
        output,
        modelId: result.model,
        tokensUsed: result.usage.total_tokens,
        durationMs: Date.now() - startMs,
        toolUseRequests: toolUseRequests?.length ? toolUseRequests : undefined,
        stopReason: stopReasonMap[choice.finish_reason],
      };
    },

    async *inferStream(request: InferRequest): AsyncIterable<InferStreamChunk> {
      const model = request.modelId === "default" ? defaultModel : request.modelId;

      const body: Record<string, unknown> = {
        model,
        messages: buildMessages(request),
        max_tokens: request.maxTokens ?? 1024,
        stream: true,
      };

      if (request.temperature !== undefined) body.temperature = request.temperature;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new AdapterError("cloud:openai", `OpenAI API error (${response.status}): ${errorBody}`, response.status);
      }

      if (!response.body) {
        throw new AdapterError("cloud:openai", "No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            if (data === "[DONE]") {
              yield { type: "done" };
              continue;
            }

            try {
              const event = JSON.parse(data) as Record<string, unknown>;
              const choices = event.choices as Array<Record<string, unknown>> | undefined;
              if (!choices?.length) continue;

              const delta = choices[0]!.delta as Record<string, unknown> | undefined;
              if (delta?.content) {
                yield { type: "text_delta", text: delta.content as string };
              }

              if (event.usage) {
                const usage = event.usage as { total_tokens: number };
                yield { type: "usage", tokensUsed: usage.total_tokens, modelId: model };
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },

    async embed(request: EmbedRequest): Promise<EmbedResponse> {
      const result = (await callApi("/v1/embeddings", {
        model: request.modelId === "default" ? "text-embedding-3-small" : request.modelId,
        input: request.content,
      })) as OpenAIEmbeddingResponse;

      const embedding = result.data[0]!.embedding;
      return {
        embedding,
        modelId: result.model,
        dimensions: embedding.length,
      };
    },

    async estimate(request: InferRequest): Promise<CostEstimate> {
      const estimatedInputTokens = Math.ceil(request.input.length / 4);
      return {
        estimatedTokens: estimatedInputTokens + (request.maxTokens ?? 1024),
        estimatedLatencyMs: 1500,
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        await callApi("/v1/chat/completions", {
          model: defaultModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
