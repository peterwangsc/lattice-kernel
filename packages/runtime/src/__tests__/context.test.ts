import { describe, it, expect } from "vitest";
import { createRequestContext, createChildContext } from "../context.js";

describe("RequestContext", () => {
  it("creates context with generated IDs", () => {
    const ctx = createRequestContext();
    expect(ctx.requestId).toMatch(/^req_/);
    expect(ctx.traceId).toMatch(/^trace_/);
    expect(ctx.spanId).toMatch(/^span_/);
    expect(ctx.parentSpanId).toBeUndefined();
    expect(ctx.timestamp).toBeTruthy();
  });

  it("uses provided traceId", () => {
    const ctx = createRequestContext({ traceId: "trace_abc" });
    expect(ctx.traceId).toBe("trace_abc");
  });

  it("uses provided scope and trust level", () => {
    const ctx = createRequestContext({
      scope: { tenantId: "acme" },
      trustLevel: "trusted_admin",
    });
    expect(ctx.scope.tenantId).toBe("acme");
    expect(ctx.trustLevel).toBe("trusted_admin");
  });

  it("includes metadata", () => {
    const ctx = createRequestContext({
      metadata: { source: "api", version: "1.0" },
    });
    expect(ctx.metadata).toEqual({ source: "api", version: "1.0" });
  });

  it("generates unique IDs for each context", () => {
    const ctx1 = createRequestContext();
    const ctx2 = createRequestContext();
    expect(ctx1.requestId).not.toBe(ctx2.requestId);
    expect(ctx1.spanId).not.toBe(ctx2.spanId);
    expect(ctx1.traceId).not.toBe(ctx2.traceId);
  });
});

describe("createChildContext", () => {
  it("inherits traceId from parent", () => {
    const parent = createRequestContext();
    const child = createChildContext(parent);
    expect(child.traceId).toBe(parent.traceId);
  });

  it("sets parentSpanId to parent's spanId", () => {
    const parent = createRequestContext();
    const child = createChildContext(parent);
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  it("generates new requestId and spanId", () => {
    const parent = createRequestContext();
    const child = createChildContext(parent);
    expect(child.requestId).not.toBe(parent.requestId);
    expect(child.spanId).not.toBe(parent.spanId);
  });

  it("inherits scope and trust level from parent", () => {
    const parent = createRequestContext({
      scope: { tenantId: "acme" },
      trustLevel: "trusted_admin",
    });
    const child = createChildContext(parent);
    expect(child.scope.tenantId).toBe("acme");
    expect(child.trustLevel).toBe("trusted_admin");
  });

  it("allows overriding scope in child", () => {
    const parent = createRequestContext({
      scope: { tenantId: "acme" },
    });
    const child = createChildContext(parent, {
      scope: { tenantId: "acme", appId: "copilot" },
    });
    expect(child.scope.appId).toBe("copilot");
  });

  it("supports multi-level nesting", () => {
    const root = createRequestContext();
    const child = createChildContext(root);
    const grandchild = createChildContext(child);

    expect(grandchild.traceId).toBe(root.traceId);
    expect(grandchild.parentSpanId).toBe(child.spanId);
    expect(child.parentSpanId).toBe(root.spanId);
  });
});
