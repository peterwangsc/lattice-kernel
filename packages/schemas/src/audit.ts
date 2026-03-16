import { z } from "zod";
import { ScopeRef, Timestamp } from "./common.js";
import { TrustLevel } from "./trust.js";

export const AuditEventType = z.enum([
  "infer",
  "embed",
  "remember",
  "retrieve",
  "adapt",
  "plan",
  "act",
  "checkpoint",
  "rollback",
  "verify",
  "policy_decision",
  "memory_write",
  "memory_delete",
  "memory_expire",
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

export const AuditEvent = z.object({
  eventId: z.string(),
  type: AuditEventType,
  requestId: z.string(),
  scope: ScopeRef,
  trustLevel: TrustLevel,
  timestamp: Timestamp,
  actor: z.string(),
  modelId: z.string().optional(),
  route: z.string().optional(),
  policyDecisions: z.array(z.string()),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
