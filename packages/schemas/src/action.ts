import { z } from "zod";
import { Timestamp } from "./common.js";

export const Action = z.object({
  actionId: z.string(),
  actor: z.string(),
  requestId: z.string(),
  planRef: z.string().optional(),
  tool: z.string(),
  input: z.record(z.unknown()),
  policyDecision: z.string(),
  result: z.record(z.unknown()).optional(),
  timestamp: Timestamp,
});
export type Action = z.infer<typeof Action>;
