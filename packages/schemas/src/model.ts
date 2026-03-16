import { z } from "zod";

export const ModelCapabilities = z.object({
  supportsEmbedding: z.boolean(),
  supportsToolCalling: z.boolean(),
  supportsAdaptation: z.boolean(),
  supportsMultimodal: z.boolean(),
});
export type ModelCapabilities = z.infer<typeof ModelCapabilities>;

export const ModelDescriptor = z.object({
  id: z.string(),
  version: z.string(),
  provider: z.string(),
  format: z.string(),
  capabilities: ModelCapabilities,
  executionTargets: z.array(z.string()),
  signature: z.string().optional(),
  hash: z.string().optional(),
  policyTags: z.array(z.string()),
});
export type ModelDescriptor = z.infer<typeof ModelDescriptor>;

export const AdaptationLayer = z.object({
  layerId: z.string(),
  baseModelId: z.string(),
  scope: z.string(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  trustLevel: z.string(),
  checkpointRef: z.string().optional(),
  writable: z.boolean(),
  expiry: z.string().datetime().optional(),
});
export type AdaptationLayer = z.infer<typeof AdaptationLayer>;
