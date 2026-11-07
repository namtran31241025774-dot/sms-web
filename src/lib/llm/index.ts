import type { LlmProvider } from "./types";
import { OpenAiProvider } from "./openai";

export * from "./types";
export * from "./openai";

export function getLlmProvider(): LlmProvider {
  return new OpenAiProvider();
}
