import { z } from "zod";
import { ModelCapabilities } from "./model.js";

export const BackendCapabilities = z.object({
  supportsLocalExecution: z.boolean(),
  supportsCloudExecution: z.boolean(),
  supportsAdaptation: z.boolean(),
  supportsStreaming: z.boolean().optional(),
  supportedFormats: z.array(z.string()),
  modelCapabilities: ModelCapabilities.optional(),
});
export type BackendCapabilities = z.infer<typeof BackendCapabilities>;

export const Message = z.object({
  role: z.enum(["user", "assistant", "tool_result"]),
  content: z.string(),
  toolUseId: z.string().optional(),
});
export type Message = z.infer<typeof Message>;

export const ToolDefinition = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
});
export type ToolDefinition = z.infer<typeof ToolDefinition>;

export const ToolUseRequest = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});
export type ToolUseRequest = z.infer<typeof ToolUseRequest>;

export const InferRequest = z.object({
  modelId: z.string(),
  input: z.string(),
  messages: z.array(Message).optional(),
  systemPrompt: z.string().optional(),
  tools: z.array(ToolDefinition).optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
});
export type InferRequest = z.infer<typeof InferRequest>;

export const InferResponse = z.object({
  output: z.string(),
  modelId: z.string(),
  tokensUsed: z.number().optional(),
  durationMs: z.number(),
  toolUseRequests: z.array(ToolUseRequest).optional(),
  stopReason: z.enum(["end_turn", "max_tokens", "tool_use", "stop_sequence"]).optional(),
});
export type InferResponse = z.infer<typeof InferResponse>;

export const EmbedRequest = z.object({
  modelId: z.string(),
  content: z.string(),
});
export type EmbedRequest = z.infer<typeof EmbedRequest>;

export const EmbedResponse = z.object({
  embedding: z.array(z.number()),
  modelId: z.string(),
  dimensions: z.number(),
});
export type EmbedResponse = z.infer<typeof EmbedResponse>;

export const CostEstimate = z.object({
  estimatedTokens: z.number().optional(),
  estimatedCost: z.number().optional(),
  estimatedLatencyMs: z.number().optional(),
  currency: z.string().optional(),
});
export type CostEstimate = z.infer<typeof CostEstimate>;

export const InferStreamChunk = z.object({
  type: z.enum(["text_delta", "usage", "done"]),
  text: z.string().optional(),
  tokensUsed: z.number().optional(),
  modelId: z.string().optional(),
});
export type InferStreamChunk = z.infer<typeof InferStreamChunk>;

/**
 * The contract every backend adapter must implement.
 * See program.md section 15.1.
 */
export interface BackendAdapter {
  readonly providerId: string;
  getCapabilities(): Promise<BackendCapabilities>;
  listModels(): Promise<import("./model.js").ModelDescriptor[]>;
  infer(request: InferRequest): Promise<InferResponse>;
  inferStream?(request: InferRequest): AsyncIterable<InferStreamChunk>;
  embed(request: EmbedRequest): Promise<EmbedResponse>;
  estimate(request: InferRequest): Promise<CostEstimate>;
  healthCheck(): Promise<boolean>;
}
