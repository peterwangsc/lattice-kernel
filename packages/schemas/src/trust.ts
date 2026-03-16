import { z } from "zod";

export const TrustLevel = z.enum([
  "trusted_system",
  "trusted_admin",
  "trusted_user_explicit",
  "trusted_user_implicit",
  "untrusted_external",
  "untrusted_model_generated",
  "quarantined",
]);
export type TrustLevel = z.infer<typeof TrustLevel>;

export const TrustEnvelope = z.object({
  inputTrustLevel: TrustLevel,
  allowedModels: z.array(z.string()),
  allowedMemoryScopes: z.array(z.string()),
  allowedTools: z.array(z.string()),
  canAdapt: z.boolean(),
  canRouteToCloud: z.boolean(),
  maxComputeBudget: z.number().optional(),
  actionApprovalMode: z.enum(["auto", "explicit", "deny"]),
});
export type TrustEnvelope = z.infer<typeof TrustEnvelope>;
