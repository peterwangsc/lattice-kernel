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

  it("infer throws not-implemented", async () => {
    await expect(
      adapter.infer({ modelId: "test", input: "hello" }),
    ).rejects.toThrow("not yet implemented");
  });

  it("embed throws not-implemented", async () => {
    await expect(
      adapter.embed({ modelId: "test", content: "hello" }),
    ).rejects.toThrow("not yet implemented");
  });
});
