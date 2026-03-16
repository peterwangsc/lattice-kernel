import { describe, it, expect } from "vitest";
import { createWebAdapter } from "../adapter.js";

describe("WebAdapter", () => {
  const adapter = createWebAdapter();

  it("has providerId 'web'", () => {
    expect(adapter.providerId).toBe("web");
  });

  it("reports local execution capability (browser-side)", async () => {
    const caps = await adapter.getCapabilities();
    expect(caps.supportsLocalExecution).toBe(true);
    expect(caps.supportsCloudExecution).toBe(false);
    expect(caps.supportedFormats).toContain("onnx-web");
  });

  it("listModels returns empty array", async () => {
    expect(await adapter.listModels()).toEqual([]);
  });

  it("healthCheck returns true", async () => {
    expect(await adapter.healthCheck()).toBe(true);
  });

  it("estimate returns zero cost", async () => {
    const est = await adapter.estimate({ modelId: "test", input: "hello" });
    expect(est.estimatedCost).toBe(0);
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
