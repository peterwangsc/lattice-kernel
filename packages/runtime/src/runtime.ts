import type { RuntimeConfig, Runtime, InferOptions, InferResult } from "./types.js";

export function createRuntime(_config: RuntimeConfig): Runtime {
  return {
    async infer(_options: InferOptions): Promise<InferResult> {
      throw new Error("Not implemented");
    },
  };
}
