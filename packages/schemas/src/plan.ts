import { z } from "zod";

export const PlanStep = z.object({
  id: z.string(),
  description: z.string(),
  requiredTools: z.array(z.string()),
  dependencies: z.array(z.string()),
  expectedOutput: z.string().optional(),
  riskFlags: z.array(z.string()),
  requiresApproval: z.boolean(),
});
export type PlanStep = z.infer<typeof PlanStep>;

export const Plan = z.object({
  planId: z.string(),
  intent: z.string(),
  steps: z.array(PlanStep),
  createdAt: z.string().datetime(),
  status: z.enum(["draft", "approved", "executing", "completed", "failed", "cancelled"]),
});
export type Plan = z.infer<typeof Plan>;
