import type {
  RuntimeConfig,
  Runtime,
  InferOptions,
  InferResult,
  EmbedOptions,
  EmbedResult,
  PlanOptions,
  ActOptions,
  ActResult,
} from "./types.js";
import type { BackendAdapter, Plan } from "@lattice-kernel/schemas";

let requestCounter = 0;
function nextRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

export function createRuntime(config: RuntimeConfig): Runtime {
  const { adapters, policyEngine, auditSink, tools = [] } = config;
  const toolMap = new Map(tools.map((t) => [t.toolId, t]));

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

    async plan(options: PlanOptions): Promise<Plan> {
      const requestId = nextRequestId();

      // Policy check for planning
      const policyDecision = policyEngine.evaluate({
        operation: "canPlan",
        scope: options.scope ?? {},
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "plan",
          requestId,
          scope: options.scope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          policyDecisions: policyDecision.matchedRules,
          error: policyDecision.reason ?? "Policy denied plan",
        });
        throw new Error(
          `Policy denied plan: ${policyDecision.reason ?? "no reason given"}`,
        );
      }

      // Build the plan from provided steps or create a single-step plan
      const steps = options.steps ?? [
        {
          id: `step_${requestId}_1`,
          description: options.goal,
          requiredTools: options.availableTools ?? [],
          dependencies: [],
          riskFlags: [],
          requiresApproval: false,
        },
      ];

      const plan: Plan = {
        planId: `plan_${requestId}`,
        intent: options.goal,
        steps,
        createdAt: new Date().toISOString(),
        status: "draft",
      };

      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "plan",
        requestId,
        scope: options.scope ?? {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        policyDecisions: policyDecision.matchedRules,
      });

      return plan;
    },

    async act(options: ActOptions): Promise<ActResult> {
      const requestId = nextRequestId();

      // Policy check for action
      const policyDecision = policyEngine.evaluate({
        operation: "canAct",
        scope: options.scope ?? {},
        tool: options.tool,
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "act",
          requestId,
          scope: options.scope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          policyDecisions: policyDecision.matchedRules,
          error: policyDecision.reason ?? "Policy denied action",
        });
        throw new Error(
          `Policy denied action on tool "${options.tool}": ${policyDecision.reason ?? "no reason given"}`,
        );
      }

      if (policyDecision.requiresApproval) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "act",
          requestId,
          scope: options.scope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          policyDecisions: policyDecision.matchedRules,
          error: "Action requires approval — not yet implemented",
        });
        throw new Error(
          `Action on tool "${options.tool}" requires approval`,
        );
      }

      // Find the tool adapter
      const toolAdapter = toolMap.get(options.tool);
      if (!toolAdapter) {
        throw new Error(`Tool not found: ${options.tool}`);
      }

      // Execute the tool
      const result = await toolAdapter.execute(options.input);

      const action = {
        actionId: `act_${requestId}`,
        actor: "runtime",
        requestId,
        planRef: options.planRef,
        tool: options.tool,
        input: options.input,
        policyDecision: policyDecision.matchedRules.join(",") || "allowed",
        result,
        timestamp: new Date().toISOString(),
      };

      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "act",
        requestId,
        scope: options.scope ?? {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        policyDecisions: policyDecision.matchedRules,
      });

      return { action, policyDecision };
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
