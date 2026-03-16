import type { RuntimeConfig, Runtime, InferOptions, InferResult, EmbedOptions, EmbedResult } from "./types.js";
import type { BackendAdapter } from "@lattice-kernel/schemas";

let requestCounter = 0;
function nextRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

export function createRuntime(config: RuntimeConfig): Runtime {
  const { adapters, policyEngine, auditSink } = config;

  async function selectAdapter(
    preference: string | undefined,
  ): Promise<BackendAdapter> {
    if (adapters.length === 0) {
      throw new Error("No adapters configured");
    }

    for (const adapter of adapters) {
      const caps = await adapter.getCapabilities();

      if (preference === "local" && caps.supportsLocalExecution) {
        return adapter;
      }
      if (preference === "cloud" && caps.supportsCloudExecution) {
        return adapter;
      }
    }

    // "auto" or no preference: return first healthy adapter
    for (const adapter of adapters) {
      const healthy = await adapter.healthCheck();
      if (healthy) return adapter;
    }

    return adapters[0]!;
  }

  return {
    async infer(options: InferOptions): Promise<InferResult> {
      const requestId = nextRequestId();
      const startMs = Date.now();

      // Policy check
      const policyDecision = policyEngine.evaluate({
        operation: "canInfer",
        scope: options.memoryScope ?? {},
        modelId: options.model,
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "infer",
          requestId,
          scope: options.memoryScope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          modelId: options.model,
          policyDecisions: policyDecision.matchedRules,
          error: policyDecision.reason ?? "Policy denied",
          durationMs: Date.now() - startMs,
        });
        throw new Error(
          `Policy denied infer: ${policyDecision.reason ?? "no reason given"}`,
        );
      }

      // Route selection
      const adapter = await selectAdapter(options.executionPreference);
      const route = adapter.providerId;

      // Execute inference
      const adapterResponse = await adapter.infer({
        modelId: options.model ?? "default",
        input: options.input,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });

      const durationMs = Date.now() - startMs;

      // Audit
      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "infer",
        requestId,
        scope: options.memoryScope ?? {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        modelId: adapterResponse.modelId,
        route,
        policyDecisions: policyDecision.matchedRules,
        durationMs,
      });

      return {
        requestId,
        output: adapterResponse.output,
        model: adapterResponse.modelId,
        route,
        durationMs,
        policyDecision,
        adapterResponse,
      };
    },

    async embed(options: EmbedOptions): Promise<EmbedResult> {
      const requestId = nextRequestId();
      const startMs = Date.now();

      const policyDecision = policyEngine.evaluate({
        operation: "canInfer",
        scope: {},
        modelId: options.model,
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        throw new Error(
          `Policy denied embed: ${policyDecision.reason ?? "no reason given"}`,
        );
      }

      const adapter = await selectAdapter("auto");

      const adapterResponse = await adapter.embed({
        modelId: options.model ?? "default",
        content: options.content,
      });

      const durationMs = Date.now() - startMs;

      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "embed",
        requestId,
        scope: {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        modelId: adapterResponse.modelId,
        route: adapter.providerId,
        policyDecisions: policyDecision.matchedRules,
        durationMs,
      });

      return {
        requestId,
        embedding: adapterResponse.embedding,
        model: adapterResponse.modelId,
        dimensions: adapterResponse.dimensions,
        durationMs,
        adapterResponse,
      };
    },

    async listAvailableModels(): Promise<string[]> {
      const allModels: string[] = [];
      for (const adapter of adapters) {
        const models = await adapter.listModels();
        allModels.push(...models.map((m) => m.id));
      }
      return allModels;
    },

    async healthCheck(): Promise<Record<string, boolean>> {
      const result: Record<string, boolean> = {};
      for (const adapter of adapters) {
        result[adapter.providerId] = await adapter.healthCheck();
      }
      return result;
    },
  };
}
