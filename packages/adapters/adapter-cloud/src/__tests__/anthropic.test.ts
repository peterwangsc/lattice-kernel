import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAnthropicAdapter } from "../anthropic.js";
import type { InferStreamChunk } from "@lattice-kernel/schemas";

const MOCK_RESPONSE = {
  id: "msg_123",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello! How can I help?" }],
  model: "claude-sonnet-4-6-20250514",
  usage: { input_tokens: 10, output_tokens: 8 },
};

describe("AnthropicAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchSuccess(body: unknown = MOCK_RESPONSE) {
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
    const adapter = createAnthropicAdapter({ apiKey: "test-key" });
    expect(adapter.providerId).toBe("cloud:anthropic");
  });

  it("reports cloud capabilities", async () => {
    const adapter = createAnthropicAdapter({ apiKey: "test-key" });
    const caps = await adapter.getCapabilities();
    expect(caps.supportsCloudExecution).toBe(true);
    expect(caps.supportsLocalExecution).toBe(false);
  });

  it("lists Anthropic models", async () => {
    const adapter = createAnthropicAdapter({ apiKey: "test-key" });
    const models = await adapter.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id.includes("claude"))).toBe(true);
    expect(models.every((m) => m.provider === "anthropic")).toBe(true);
  });

  describe("infer", () => {
    it("calls the messages API and returns response", async () => {
      mockFetchSuccess();
      const adapter = createAnthropicAdapter({ apiKey: "test-key" });

      const result = await adapter.infer({
        modelId: "claude-sonnet-4-6",
        input: "Hello",
      });

      expect(result.output).toBe("Hello! How can I help?");
      expect(result.modelId).toBe("claude-sonnet-4-6-20250514");
      expect(result.tokensUsed).toBe(18);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0]!;
      expect(fetchCall[0]).toBe("https://api.anthropic.com/v1/messages");
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.model).toBe("claude-sonnet-4-6");
      expect(body.messages[0].content).toBe("Hello");
    });

    it("uses default model when modelId is 'default'", async () => {
      mockFetchSuccess();
      const adapter = createAnthropicAdapter({
        apiKey: "test-key",
        defaultModel: "claude-haiku-4-5",
      });

      await adapter.infer({ modelId: "default", input: "test" });

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]
          .body as string,
      );
      expect(body.model).toBe("claude-haiku-4-5");
    });

    it("passes temperature and stop sequences", async () => {
      mockFetchSuccess();
      const adapter = createAnthropicAdapter({ apiKey: "test-key" });

      await adapter.infer({
        modelId: "claude-sonnet-4-6",
        input: "test",
        temperature: 0.5,
        stopSequences: ["END"],
      });

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]
          .body as string,
      );
      expect(body.temperature).toBe(0.5);
      expect(body.stop_sequences).toEqual(["END"]);
    });

    it("sends correct headers", async () => {
      mockFetchSuccess();
      const adapter = createAnthropicAdapter({ apiKey: "sk-test-123" });

      await adapter.infer({ modelId: "claude-sonnet-4-6", input: "test" });

      const headers = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0]![1].headers;
      expect(headers["x-api-key"]).toBe("sk-test-123");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("throws on API error", async () => {
      mockFetchError(401, '{"error":"invalid_api_key"}');
      const adapter = createAnthropicAdapter({ apiKey: "bad-key" });

      await expect(
        adapter.infer({ modelId: "claude-sonnet-4-6", input: "test" }),
      ).rejects.toThrow("Anthropic API error (401)");
    });

    it("uses custom base URL", async () => {
      mockFetchSuccess();
      const adapter = createAnthropicAdapter({
        apiKey: "test-key",
        baseUrl: "https://custom.api.example.com",
      });

      await adapter.infer({ modelId: "claude-sonnet-4-6", input: "test" });

      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0],
      ).toBe("https://custom.api.example.com/v1/messages");
    });
  });

  describe("embed", () => {
    it("throws because Anthropic has no embedding API", async () => {
      const adapter = createAnthropicAdapter({ apiKey: "test-key" });
      await expect(
        adapter.embed({ modelId: "default", content: "test" }),
      ).rejects.toThrow("embedding API");
    });
  });

  describe("estimate", () => {
    it("returns rough cost estimate", async () => {
      const adapter = createAnthropicAdapter({ apiKey: "test-key" });
      const estimate = await adapter.estimate({
        modelId: "claude-sonnet-4-6",
        input: "Hello world",
      });
      expect(estimate.estimatedTokens).toBeGreaterThan(0);
      expect(estimate.estimatedLatencyMs).toBeGreaterThan(0);
    });
  });

  describe("healthCheck", () => {
    it("returns true on successful API call", async () => {
      mockFetchSuccess();
      const adapter = createAnthropicAdapter({ apiKey: "test-key" });
      expect(await adapter.healthCheck()).toBe(true);
    });

    it("returns false on API error", async () => {
      mockFetchError(401, "unauthorized");
      const adapter = createAnthropicAdapter({ apiKey: "bad-key" });
      expect(await adapter.healthCheck()).toBe(false);
    });
  });

  describe("inferStream", () => {
    function mockSSEResponse(events: string[]) {
      const sseText = events.join("\n") + "\n";
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseText));
          controller.close();
        },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        body: stream,
      });
    }

    it("streams text deltas from SSE events", async () => {
      mockSSEResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"World"}}',
        'data: {"type":"message_delta","usage":{"output_tokens":5}}',
        'data: {"type":"message_stop"}',
      ]);

      const adapter = createAnthropicAdapter({ apiKey: "test-key" });
      const chunks: InferStreamChunk[] = [];

      for await (const chunk of adapter.inferStream!({
        modelId: "claude-sonnet-4-6",
        input: "test",
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual({ type: "text_delta", text: "Hello " });
      expect(chunks[1]).toEqual({ type: "text_delta", text: "World" });
      expect(chunks[2]!.type).toBe("usage");
      expect(chunks[2]!.tokensUsed).toBe(5);
      expect(chunks[3]!.type).toBe("done");
    });

    it("sends stream: true in request body", async () => {
      mockSSEResponse([
        'data: {"type":"message_stop"}',
      ]);

      const adapter = createAnthropicAdapter({ apiKey: "test-key" });
      // Consume the stream
      for await (const _chunk of adapter.inferStream!({
        modelId: "claude-sonnet-4-6",
        input: "test",
      })) {
        // drain
      }

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]
          .body as string,
      );
      expect(body.stream).toBe(true);
    });

    it("reports supportsStreaming in capabilities", async () => {
      const adapter = createAnthropicAdapter({ apiKey: "test-key" });
      const caps = await adapter.getCapabilities();
      expect(caps.supportsStreaming).toBe(true);
    });
  });
});
