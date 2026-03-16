#!/usr/bin/env node
/**
 * Lattice Kernel CLI
 *
 * Interactive chat with memory, streaming, and tool use.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... pnpm --filter @lattice-kernel/cli start
 *   OPENAI_API_KEY=sk-... PROVIDER=openai pnpm --filter @lattice-kernel/cli start
 */

import * as readline from "node:readline";
import {
  createLattice,
  createConversationManager,
  createRetryAdapter,
  PolicyDeniedError,
} from "@lattice-kernel/sdk";
import type { BackendAdapter, PolicyRule } from "@lattice-kernel/sdk";
import { createAnthropicAdapter, createOpenAIAdapter } from "@lattice-kernel/adapter-cloud";

// --- Configuration ---
const PROVIDER = process.env.PROVIDER ?? "anthropic";
const BASE_URL = process.env.BASE_URL;
const MODEL = process.env.MODEL;
const API_KEY =
  process.env.ANTHROPIC_API_KEY ??
  process.env.OPENAI_API_KEY ??
  process.env.API_KEY ??
  "";

if (!API_KEY && !BASE_URL && PROVIDER === "anthropic") {
  console.error("Set an API key or BASE_URL for a local server.");
  console.error("");
  console.error("Examples:");
  console.error("  # Anthropic");
  console.error("  ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @lattice-kernel/cli start");
  console.error("");
  console.error("  # OpenAI");
  console.error("  OPENAI_API_KEY=sk-... PROVIDER=openai pnpm --filter @lattice-kernel/cli start");
  console.error("");
  console.error("  # Local LLM (Ollama, vLLM, LM Studio)");
  console.error("  BASE_URL=http://localhost:11434 MODEL=llama3 pnpm --filter @lattice-kernel/cli start");
  process.exit(1);
}

function createAdapter(): BackendAdapter {
  // Local/custom server via BASE_URL
  if (BASE_URL) {
    return createOpenAIAdapter({
      baseUrl: BASE_URL,
      apiKey: API_KEY || undefined,
      defaultModel: MODEL ?? "default",
    });
  }
  // OpenAI
  if (PROVIDER === "openai") {
    return createOpenAIAdapter({ apiKey: API_KEY, defaultModel: MODEL ?? "gpt-4o" });
  }
  // Anthropic (default)
  return createAnthropicAdapter({ apiKey: API_KEY, defaultModel: MODEL });
}

const ALLOW_ALL: PolicyRule = {
  id: "allow-all",
  name: "Allow all",
  permissions: ["canInfer", "canRemember", "canRetrieve", "canPlan", "canAct"],
  effect: "allow",
  priority: 10,
};

// --- Setup ---
const adapter = createRetryAdapter(createAdapter(), { maxRetries: 2, baseDelayMs: 500 });

const lattice = createLattice({
  adapters: [adapter],
  policyRules: [ALLOW_ALL],
  defaultTrustLevel: "trusted_user_explicit",
});

const convMgr = createConversationManager();
const conv = convMgr.create();

// --- REPL ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const providerLabel = BASE_URL ? `${BASE_URL} (${MODEL ?? "default"})` : PROVIDER;
console.log(`Lattice Kernel CLI (${providerLabel})`);
console.log("Commands: /remember <text>, /recall <query>, /checkpoint, /rollback, /quit");
console.log("---");

function prompt(): void {
  rl.question("you> ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    try {
      if (trimmed === "/quit" || trimmed === "/exit") {
        console.log("Goodbye.");
        rl.close();
        process.exit(0);
      }

      if (trimmed.startsWith("/remember ")) {
        const content = trimmed.slice(10);
        const item = await lattice.remember(content, { type: "semantic" });
        console.log(`Remembered (${item.id}): ${content}`);
        prompt();
        return;
      }

      if (trimmed.startsWith("/recall ")) {
        const query = trimmed.slice(8);
        const items = await lattice.retrieve(query, { topK: 5 });
        if (items.length === 0) {
          console.log("No memories found.");
        } else {
          for (const item of items) {
            console.log(`  [${item.type}] ${item.content}`);
          }
        }
        prompt();
        return;
      }

      if (trimmed === "/checkpoint") {
        const cp = await lattice.checkpoint("cli-checkpoint");
        console.log(`Checkpoint: ${cp.checkpointId}`);
        prompt();
        return;
      }

      if (trimmed === "/rollback") {
        const cps = lattice.listCheckpoints();
        if (cps.length === 0) {
          console.log("No checkpoints available.");
        } else {
          await lattice.rollback(cps[0]!.checkpointId);
          console.log(`Rolled back to: ${cps[0]!.checkpointId}`);
        }
        prompt();
        return;
      }

      // Chat with streaming
      conv.addUser(trimmed);
      const streamResult = await lattice.inferStream(trimmed, {
        messages: conv.getMessages(),
      });

      process.stdout.write("assistant> ");
      let fullResponse = "";
      for await (const chunk of streamResult.stream) {
        if (chunk.type === "text_delta" && chunk.text) {
          process.stdout.write(chunk.text);
          fullResponse += chunk.text;
        }
      }
      console.log("");
      conv.addAssistant(fullResponse);
    } catch (err) {
      if (err instanceof PolicyDeniedError) {
        console.error(`Policy denied: ${err.message}`);
      } else if (err instanceof Error) {
        console.error(`Error: ${err.message}`);
      }
    }

    prompt();
  });
}

prompt();
