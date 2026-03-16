import { z } from "zod";

export const Timestamp = z.string().datetime();
export type Timestamp = z.infer<typeof Timestamp>;

export const Duration = z.string().regex(/^\d+[smhd]$/, "Duration must be like 30s, 5m, 2h, 180d");
export type Duration = z.infer<typeof Duration>;

export const ScopeRef = z.object({
  tenantId: z.string().optional(),
  appId: z.string().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
});
export type ScopeRef = z.infer<typeof ScopeRef>;

export const ExecutionPreference = z.enum(["local", "cloud", "auto"]);
export type ExecutionPreference = z.infer<typeof ExecutionPreference>;
