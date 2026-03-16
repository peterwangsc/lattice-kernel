import { z } from "zod";
import { ScopeRef } from "./common.js";
import { TrustLevel } from "./trust.js";

export const RequestContext = z.object({
  requestId: z.string(),
  traceId: z.string().optional(),
  parentSpanId: z.string().optional(),
  spanId: z.string().optional(),
  scope: ScopeRef,
  trustLevel: TrustLevel,
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});
export type RequestContext = z.infer<typeof RequestContext>;
