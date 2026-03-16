import { describe, it, expect } from "vitest";
import { createLocalAdapter } from "../adapter.js";

describe("LocalAdapter", () => {
  const adapter = createLocalAdapter();

  it("has providerId 'local'", () => {
    expect(adapter.providerId).toBe("local");
  });

  it("reports local execution capability", async () => {
    const caps = await adapter.getCapabilities();
    expect(caps.supportsLocalExecution).toBe(true);
    expect(caps.supportsCloudExecution).toBe(false);
    expect(caps.supportedFormats).toContain("gguf");
    expect(caps.supportedFormats).toContain("onnx");
  });

  it("listModels returns empty array (no models loaded)", async () => {
    const models = await adapter.listModels();
    expect(models).toEqual([]);
  });

  it("healthCheck returns true", async () => {
    expect(await adapter.healthCheck()).toBe(true);
  });

  it("estimate returns zero cost (local)", async () => {
    const est = await adapter.estimate({ modelId: "test", input: "hello" });
    expect(est.estimatedCost).toBe(0);
    expect(est.estimatedLatencyMs).toBe(0);
  });

  it("infer returns stub response", async () => {
    const result = await adapter.infer({ modelId: "test", input: "hello" });
    expect(result.output).toContain("[local stub]");
    expect(result.output).toContain("hello");
  });

  it("embed returns zero embedding", async () => {
    const result = await adapter.embed({ modelId: "test", content: "hello" });
    expect(result.dimensions).toBe(384);
    expect(result.embedding.length).toBe(384);
  });
});
