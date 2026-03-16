/**
 * Smoke test: verify the demo's core setup works without running
 * the full interactive demo.
 */
import { describe, it, expect } from "vitest";
import {
  createLattice,
  createConversationManager,
  createPromptTemplate,
  PolicyDeniedError,
} from "@lattice-kernel/sdk";
import type { BackendAdapter } from "@lattice-kernel/sdk";

function createMockAdapter(): BackendAdapter {
  return {
    providerId: "smoke-test",
    async getCapabilities() {
      return { supportsLocalExecution: true, supportsCloudExecution: false, supportsAdaptation: false, supportedFormats: [] };
    },
    async listModels() { return []; },
    async infer(req) {
      return { output: `echo: ${req.input}`, modelId: req.modelId, durationMs: 0, stopReason: "end_turn" as const };
    },
    async embed() { return { embedding: [0.1], modelId: "mock", dimensions: 1 }; },
    async estimate() { return {}; },
    async healthCheck() { return true; },
  };
}

describe("Sandbox demo smoke test", () => {
  it("creates a lattice and runs inference", async () => {
    const lattice = createLattice({
      adapters: [createMockAdapter()],
      policyRules: [{
        id: "allow", name: "allow", permissions: ["canInfer", "canRemember", "canRetrieve"],
        effect: "allow", priority: 1,
      }],
    });

    const result = await lattice.infer("hello");
    expect(result.output).toContain("hello");
  });

  it("conversation manager tracks messages", () => {
    const mgr = createConversationManager();
    const conv = mgr.create();
    conv.addUser("hi");
    conv.addAssistant("hello");
    expect(conv.messages).toHaveLength(2);
  });

  it("prompt template renders", () => {
    const tmpl = createPromptTemplate({
      name: "test",
      template: "Hello {{name}}!",
    });
    expect(tmpl.render({ name: "World" })).toBe("Hello World!");
  });

  it("policy denial is catchable", async () => {
    const lattice = createLattice({
      adapters: [createMockAdapter()],
      defaultDeny: true,
    });

    try {
      await lattice.infer("test");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PolicyDeniedError);
    }
  });
});
