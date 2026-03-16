import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOpenAIAdapter } from "../openai.js";
import type { InferStreamChunk } from "@lattice-kernel/schemas";

const MOCK_CHAT_RESPONSE = {
  id: "chatcmpl-123",
  choices: [{
    message: { role: "assistant", content: "Hello! How can I help?" },
    finish_reason: "stop",
  }],
  model: "gpt-4o",
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
};

const MOCK_EMBEDDING_RESPONSE = {
  data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
  model: "text-embedding-3-small",
  usage: { prompt_tokens: 5, total_tokens: 5 },
};

describe("OpenAIAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchSuccess(body: unknown = MOCK_CHAT_RESPONSE) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }

  function mockFetchError(status: number, body: string) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status,
      text: async () => body,
    });
  }

  it("has correct providerId", () => {
    const adapter = createOpenAIAdapter({ apiKey: "test" });
    expect(adapter.providerId).toBe("cloud:openai");
  });

  it("reports cloud capabilities with streaming", async () => {
    const adapter = createOpenAIAdapter({ apiKey: "test" });
    const caps = await adapter.getCapabilities();
    expect(caps.supportsCloudExecution).toBe(true);
    expect(caps.supportsStreaming).toBe(true);
  });

  it("lists OpenAI models including embedding", async () => {
    const adapter = createOpenAIAdapter({ apiKey: "test" });
    const models = await adapter.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id === "gpt-4o")).toBe(true);
    expect(models.some((m) => m.capabilities.supportsEmbedding)).toBe(true);
  });

  describe("infer", () => {
    it("calls chat completions and returns response", async () => {
      mockFetchSuccess();
      const adapter = createOpenAIAdapter({ apiKey: "sk-test" });

      const result = await adapter.infer({ modelId: "gpt-4o", input: "Hello" });

      expect(result.output).toBe("Hello! How can I help?");
      expect(result.modelId).toBe("gpt-4o");
      expect(result.tokensUsed).toBe(18);
      expect(result.stopReason).toBe("end_turn");

      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe("https://api.openai.com/v1/chat/completions");
      expect(call[1].headers.Authorization).toBe("Bearer sk-test");
    });

    it("sends system prompt as system message", async () => {
      mockFetchSuccess();
      const adapter = createOpenAIAdapter({ apiKey: "test" });

      await adapter.infer({
        modelId: "gpt-4o",
        input: "hello",
        systemPrompt: "You are helpful.",
      });

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body as string,
      );
      expect(body.messages[0]).toEqual({ role: "system", content: "You are helpful." });
      expect(body.messages[1]).toEqual({ role: "user", content: "hello" });
    });

    it("sends tools in OpenAI function format", async () => {
      mockFetchSuccess();
      const adapter = createOpenAIAdapter({ apiKey: "test" });

      await adapter.infer({
        modelId: "gpt-4o",
        input: "weather?",
        tools: [{
          name: "get_weather",
          description: "Get weather",
          inputSchema: { type: "object", properties: { city: { type: "string" } } },
        }],
      });

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body as string,
      );
      expect(body.tools[0].type).toBe("function");
      expect(body.tools[0].function.name).toBe("get_weather");
    });

    it("parses tool_calls response", async () => {
      mockFetchSuccess({
        ...MOCK_CHAT_RESPONSE,
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_123",
              function: { name: "get_weather", arguments: '{"city":"SF"}' },
            }],
          },
          finish_reason: "tool_calls",
        }],
      });

      const adapter = createOpenAIAdapter({ apiKey: "test" });
      const result = await adapter.infer({ modelId: "gpt-4o", input: "weather in SF?" });

      expect(result.stopReason).toBe("tool_use");
      expect(result.toolUseRequests).toHaveLength(1);
      expect(result.toolUseRequests![0]!.name).toBe("get_weather");
      expect(result.toolUseRequests![0]!.input).toEqual({ city: "SF" });
    });

    it("throws AdapterError on API failure", async () => {
      mockFetchError(429, "rate limited");
      const adapter = createOpenAIAdapter({ apiKey: "test" });

      await expect(
        adapter.infer({ modelId: "gpt-4o", input: "test" }),
      ).rejects.toThrow("OpenAI API error (429)");
    });

    it("works without apiKey for local servers", async () => {
      mockFetchSuccess();
      const adapter = createOpenAIAdapter({
        baseUrl: "http://localhost:11434",
        defaultModel: "llama3",
      });

      await adapter.infer({ modelId: "llama3", input: "test" });

      const headers = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].headers;
      expect(headers["Authorization"]).toBeUndefined();
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("uses custom baseUrl", async () => {
      mockFetchSuccess();
      const adapter = createOpenAIAdapter({
        baseUrl: "http://localhost:8000",
      });

      await adapter.infer({ modelId: "default", input: "test" });

      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0],
      ).toBe("http://localhost:8000/v1/chat/completions");
    });

    it("providerId reflects custom endpoint", () => {
      const adapter = createOpenAIAdapter({
        baseUrl: "http://localhost:11434",
      });
      expect(adapter.providerId).toBe("openai-compat:localhost:11434");
    });

    it("sends organization header when configured", async () => {
      mockFetchSuccess();
      const adapter = createOpenAIAdapter({ apiKey: "test", organization: "org-123" });

      await adapter.infer({ modelId: "gpt-4o", input: "test" });

      const headers = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].headers;
      expect(headers["OpenAI-Organization"]).toBe("org-123");
    });
  });

  describe("embed", () => {
    it("calls embeddings API", async () => {
      mockFetchSuccess(MOCK_EMBEDDING_RESPONSE);
      const adapter = createOpenAIAdapter({ apiKey: "test" });

      const result = await adapter.embed({ modelId: "text-embedding-3-small", content: "test" });

      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
      expect(result.dimensions).toBe(4);

      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe("https://api.openai.com/v1/embeddings");
    });
  });

  describe("inferStream", () => {
    it("streams text deltas from SSE events", async () => {
      const sseText = [
        'data: {"choices":[{"delta":{"content":"Hello "}}]}',
        'data: {"choices":[{"delta":{"content":"World"}}]}',
        "data: [DONE]",
      ].join("\n") + "\n";

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseText));
            controller.close();
          },
        }),
      });

      const adapter = createOpenAIAdapter({ apiKey: "test" });
      const chunks: InferStreamChunk[] = [];

      for await (const chunk of adapter.inferStream!({ modelId: "gpt-4o", input: "test" })) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.type === "text_delta" && c.text === "Hello ")).toBe(true);
      expect(chunks.some((c) => c.type === "text_delta" && c.text === "World")).toBe(true);
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });
  });
});
