import type { RequestContext, ScopeRef, TrustLevel } from "@lattice-kernel/schemas";
import { randomBytes } from "node:crypto";

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export interface CreateContextOptions {
  scope?: ScopeRef;
  trustLevel?: TrustLevel;
  traceId?: string;
  parentSpanId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new RequestContext. If no traceId is provided, generates
 * a new trace. Always generates a new spanId.
 */
export function createRequestContext(
  options: CreateContextOptions = {},
): RequestContext {
  return {
    requestId: generateId("req"),
    traceId: options.traceId ?? generateId("trace"),
    spanId: generateId("span"),
    parentSpanId: options.parentSpanId,
    scope: options.scope ?? {},
    trustLevel: options.trustLevel ?? "trusted_user_explicit",
    timestamp: new Date().toISOString(),
    metadata: options.metadata,
  };
}

/**
 * Creates a child context from a parent, inheriting the traceId
 * and setting parentSpanId to the parent's spanId.
 */
export function createChildContext(
  parent: RequestContext,
  overrides: Partial<CreateContextOptions> = {},
): RequestContext {
  return createRequestContext({
    scope: overrides.scope ?? parent.scope,
    trustLevel: overrides.trustLevel ?? parent.trustLevel,
    traceId: parent.traceId,
    parentSpanId: parent.spanId,
    metadata: overrides.metadata ?? parent.metadata,
  });
}
