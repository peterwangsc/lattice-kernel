import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStore } from "../memory-store.js";
import { createEmbeddingMemoryStore } from "../embedding-store.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { MemoryStore, MemoryWriteInput } from "../types.js";

function makeInput(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    scope: { tenantId: "t1" },
    type: "semantic",
    content: "test content",
    source: "test",
    provenance: {},
    classification: "internal",
    trustLevel: "trusted_user_explicit",
    ...overrides,
  };
}

/**
 * Simple deterministic embedding: maps each character to a position
 * in a fixed-dimension vector based on character code.
 */
function simpleEmbed(content: string): number[] {
  const dims = 8;
  const vec = new Array(dims).fill(0) as number[];
  for (const char of content.toLowerCase()) {
    const idx = char.charCodeAt(0) % dims;
    vec[idx] = (vec[idx] ?? 0) + 1;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0));
  if (norm > 0) {
    for (let i = 0; i < dims; i++) vec[i] = vec[i]! / norm;
  }
  return vec;
}

describe("EmbeddingMemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const auditSink = createMemoryAuditSink();
    const inner = createMemoryStore({ policyEngine, auditSink });
    store = createEmbeddingMemoryStore(inner, async (content) =>
      simpleEmbed(content),
    );
  });

  it("writes items with embeddings", async () => {
    const item = await store.write(makeInput({ content: "hello world" }));
    expect(item.id).toBeTruthy();
    expect(item.content).toBe("hello world");
  });

  it("retrieves by semantic similarity", async () => {
    await store.write(makeInput({ content: "the weather is sunny and warm" }));
    await store.write(makeInput({ content: "quarterly billing invoice sent" }));
    await store.write(makeInput({ content: "the temperature is hot today" }));

    const results = await store.retrieve("weather forecast temperature", {
      tenantId: "t1",
    });

    // Weather-related items should rank higher than billing
    expect(results.length).toBeGreaterThan(0);
    const contents = results.map((r) => r.content);
    // The billing item should be ranked lower
    const weatherIdx = contents.findIndex((c) => c.includes("weather"));
    const billingIdx = contents.findIndex((c) => c.includes("billing"));
    if (weatherIdx >= 0 && billingIdx >= 0) {
      expect(weatherIdx).toBeLessThan(billingIdx);
    }
  });

  it("respects topK", async () => {
    for (let i = 0; i < 10; i++) {
      await store.write(makeInput({ content: `item number ${i}` }));
    }
    const results = await store.retrieve("item", { tenantId: "t1" }, { topK: 3 });
    expect(results).toHaveLength(3);
  });

  it("handles embedding failure gracefully", async () => {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const auditSink = createMemoryAuditSink();
    const inner = createMemoryStore({ policyEngine, auditSink });
    let shouldFail = false;

    const flakyStore = createEmbeddingMemoryStore(inner, async (content) => {
      if (shouldFail) throw new Error("embed service down");
      return simpleEmbed(content);
    });

    // Write succeeds even with embed failure
    await flakyStore.write(makeInput({ content: "will embed" }));
    shouldFail = true;
    const item = await flakyStore.write(makeInput({ content: "embed fails" }));
    expect(item.content).toBe("embed fails");

    // Retrieve still works (falls back to text scoring)
    shouldFail = false;
    const results = await flakyStore.retrieve("embed", { tenantId: "t1" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("deletes embeddings when item deleted", async () => {
    const item = await store.write(makeInput({ content: "delete me" }));
    await store.delete(item.id);
    expect(await store.get(item.id)).toBeUndefined();
    expect(store.count()).toBe(0);
  });

  it("delegates checkpoint/rollback to inner store", async () => {
    await store.write(makeInput({ content: "original" }));
    const cp = await store.checkpoint("test");

    await store.write(makeInput({ content: "added" }));
    expect(store.count()).toBe(2);

    await store.rollback(cp.checkpointId);
    expect(store.count()).toBe(1);
  });
});
