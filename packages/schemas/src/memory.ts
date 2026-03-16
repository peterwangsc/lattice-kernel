import { z } from "zod";
import { ScopeRef, Timestamp } from "./common.js";
import { TrustLevel } from "./trust.js";

export const MemoryType = z.enum([
  "session",
  "working",
  "episodic",
  "semantic",
  "preference",
  "organizational",
  "policy",
  "tool_output",
]);
export type MemoryType = z.infer<typeof MemoryType>;

export const MemoryItem = z.object({
  id: z.string(),
  scope: ScopeRef,
  type: MemoryType,
  content: z.string(),
  embeddingRef: z.string().optional(),
  summary: z.string().optional(),
  source: z.string(),
  provenance: z.record(z.unknown()),
  classification: z.string(),
  trustLevel: TrustLevel,
  createdAt: Timestamp,
  expiresAt: Timestamp.optional(),
  retentionPolicy: z.string().optional(),
  subjectRefs: z.array(z.string()),
  tags: z.array(z.string()),
  hash: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryItem>;
