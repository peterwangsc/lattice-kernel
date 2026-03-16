import { z } from "zod";
import { Timestamp } from "./common.js";

export const CheckpointTarget = z.enum(["adaptation", "memory", "policy"]);
export type CheckpointTarget = z.infer<typeof CheckpointTarget>;

export const Checkpoint = z.object({
  checkpointId: z.string(),
  target: CheckpointTarget,
  targetRef: z.string(),
  createdAt: Timestamp,
  createdBy: z.string(),
  description: z.string().optional(),
  hash: z.string(),
});
export type Checkpoint = z.infer<typeof Checkpoint>;
