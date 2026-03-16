/**
 * Lattice Kernel — Custom Adapter Example
 *
 * Shows how to create a BackendAdapter for any LLM backend:
 * - Local model (llama.cpp, Ollama, vLLM)
 * - Custom cloud API
 * - Web-based model (WebLLM, ONNX Runtime Web)
 *
 * Run: npx tsx examples/custom-adapter.ts
 */

import { createLattice } from "@lattice-kernel/sdk";
import type { BackendAdapter, InferRequest, InferResponse } from "@lattice-kernel/sdk";

// =============================================================
// Example 1: Local LLM via Ollama (HTTP API at localhost:11434)
// =============================================================
function createOllamaAdapter(config: {
  baseUrl?: string;
  model?: string;
}): BackendAdapter {
  const baseUrl = config.baseUrl ?? "http://localhost:11434";
  const defaultModel = config.model ?? "llama3";

  return {
    providerId: "local:ollama",

    async getCapabilities() {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportedFormats: ["gguf"],
      };
    },

    async listModels() {
      // Call Ollama's /api/tags to list installed models
      try {
        const res = await fetch(`${baseUrl}/api/tags`);
        const data = (await res.json()) as { models: Array<{ name: string }> };
        return data.models.map((m) => ({
          id: m.name,
          version: m.name,
          provider: "ollama",
          format: "gguf",
          capabilities: {
            supportsEmbedding: true,
            supportsToolCalling: false,
            supportsAdaptation: false,
            supportsMultimodal: false,
          },
          executionTargets: ["cpu", "gpu"],
          policyTags: ["local", "ollama"],
        }));
      } catch {
        return [];
      }
    },

    async infer(request: InferRequest): Promise<InferResponse> {
      const model = request.modelId === "default" ? defaultModel : request.modelId;
      const startMs = Date.now();

      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: request.input,
          stream: false,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens,
          },
        }),
      });

      if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
      const data = (await res.json()) as { response: string; model: string };

      return {
        output: data.response,
        modelId: data.model,
        durationMs: Date.now() - startMs,
      };
    },

    async embed(request) {
      const res = await fetch(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.modelId === "default" ? defaultModel : request.modelId,
          prompt: request.content,
        }),
      });

      const data = (await res.json()) as { embedding: number[] };
      return {
        embedding: data.embedding,
        modelId: request.modelId,
        dimensions: data.embedding.length,
      };
    },

    async estimate() {
      return { estimatedLatencyMs: 500, estimatedCost: 0 };
    },

    async healthCheck() {
      try {
        const res = await fetch(`${baseUrl}/api/tags`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

// =============================================================
// Example 2: Any OpenAI-compatible API (vLLM, LocalAI, LiteLLM)
// =============================================================
function createOpenAICompatibleAdapter(config: {
  baseUrl: string;
  apiKey?: string;
  model: string;
}): BackendAdapter {
  return {
    providerId: `custom:${config.baseUrl}`,

    async getCapabilities() {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportedFormats: ["api"],
      };
    },

    async listModels() {
      return [{
        id: config.model,
        version: "1.0",
        provider: "custom",
        format: "api",
        capabilities: {
          supportsEmbedding: false,
          supportsToolCalling: false,
          supportsAdaptation: false,
          supportsMultimodal: false,
        },
        executionTargets: ["custom"],
        policyTags: ["custom"],
      }];
    },

    async infer(request) {
      const startMs = Date.now();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

      const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: request.modelId === "default" ? config.model : request.modelId,
          messages: [{ role: "user", content: request.input }],
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature,
        }),
      });

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        model: string;
        usage: { total_tokens: number };
      };

      return {
        output: data.choices[0]!.message.content,
        modelId: data.model,
        tokensUsed: data.usage.total_tokens,
        durationMs: Date.now() - startMs,
      };
    },

    async embed() {
      throw new Error("Embedding not configured for this adapter");
    },

    async estimate() {
      return { estimatedLatencyMs: 1000 };
    },

    async healthCheck() {
      try {
        const res = await fetch(`${config.baseUrl}/v1/models`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

// =============================================================
// Usage
// =============================================================
async function main() {
  // Pick your adapter:
  // const adapter = createOllamaAdapter({ model: "llama3" });
  // const adapter = createOpenAICompatibleAdapter({
  //   baseUrl: "http://localhost:8000",
  //   model: "my-local-model",
  // });

  // For this example, use the built-in local stub:
  const { createLocalAdapter } = await import("@lattice-kernel/adapter-local");
  const adapter = createLocalAdapter();

  const lattice = createLattice({
    adapters: [adapter],
    policyRules: [{
      id: "allow-all",
      name: "Allow all",
      permissions: ["canInfer", "canRemember", "canRetrieve"],
      effect: "allow",
      priority: 10,
    }],
  });

  const result = await lattice.infer("Hello from custom adapter!");
  console.log("Result:", result.output);
  console.log("Route:", result.route);

  console.log("\nTo use a real adapter:");
  console.log("  1. Start Ollama: ollama serve");
  console.log("  2. Replace createLocalAdapter() with createOllamaAdapter()");
  console.log("  3. Or point createOpenAICompatibleAdapter at your vLLM/LocalAI server");
}

main().catch(console.error);
