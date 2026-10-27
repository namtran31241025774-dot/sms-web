export type LlmRole = "system" | "user" | "assistant" | "tool";

export type LlmToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type LlmMessage = {
  role: LlmRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
};

export type LlmToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmResponse = {
  content: string | null;
  tool_calls?: LlmToolCall[];
  stop_reason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
};

export interface LlmProvider {
  readonly name: string;
  chat(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
    },
  ): Promise<LlmResponse>;
}
