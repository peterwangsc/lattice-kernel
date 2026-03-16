import { describe, it, expect } from "vitest";
import { createLattice, createRetryAdapter } from "@lattice-kernel/sdk";
import { createLocalAdapter } from "@lattice-kernel/adapter-local";

describe("CLI smoke test", () => {
  it("creates lattice with local stub adapter", async () => {
    const adapter = createRetryAdapter(createLocalAdapter(), {
      maxRetries: 1,
      baseDelayMs: 1,
    });

    const lattice = createLattice({
      adapters: [adapter],
      policyRules: [{
        id: "allow", name: "allow",
        permissions: ["canInfer", "canRemember", "canRetrieve"],
        effect: "allow", priority: 1,
      }],
    });

    const result = await lattice.infer("test");
    expect(result.output).toContain("[local stub]");
    expect(result.route).toBe("local");
  });

  it("memory works through lattice", async () => {
    const lattice = createLattice({
      adapters: [createLocalAdapter()],
      policyRules: [{
        id: "allow", name: "allow",
        permissions: ["canInfer", "canRemember", "canRetrieve"],
        effect: "allow", priority: 1,
      }],
    });

    await lattice.remember("test memory", { type: "semantic" });
    const items = await lattice.retrieve("test");
    expect(items.length).toBeGreaterThan(0);
  });
});
