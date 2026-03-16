import { z } from "zod";

export const Permission = z.enum([
  "canInfer",
  "canRetrieve",
  "canRemember",
  "canAdapt",
  "canPlan",
  "canAct",
  "canRouteToCloud",
]);
export type Permission = z.infer<typeof Permission>;

export const PolicyRule = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  permissions: z.array(Permission),
  scopePattern: z.string().optional(),
  modelPattern: z.string().optional(),
  toolPattern: z.string().optional(),
  effect: z.enum(["allow", "deny", "require_approval"]),
  priority: z.number(),
});
export type PolicyRule = z.infer<typeof PolicyRule>;

export const PolicyDecision = z.object({
  allowed: z.boolean(),
  requiresApproval: z.boolean(),
  matchedRules: z.array(z.string()),
  reason: z.string().optional(),
});
export type PolicyDecision = z.infer<typeof PolicyDecision>;
