import type { LlmMessage, LlmProvider, LlmResponse, LlmToolDefinition } from "./types";
import {privateMessages} from './privacy';

export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  private apiKey: string | null;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl = "https://api.openai.com/v1") {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || null;
    this.baseUrl = baseUrl;
  }

  async chat(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
    },
  ): Promise<LlmResponse> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY chưa được cấu hình");
    }

    const model = options?.model;
    if (!model) throw new Error("Chưa chọn model được phép");
    const body: Record<string, unknown> = {
      model,
      messages: privateMessages(messages).map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })),
      // 4000 đôi khi cắt cụt lệnh save_opportunity_research (bản nghiên cứu 10 mục) → JSON hỏng,
      // model thử lại nhiều lần và vượt trần token mỗi lần chạy. gpt-4o cho tối đa 16.384.
      max_tokens: options?.maxTokens ?? 8000,
      temperature: options?.temperature ?? 0.2,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      signal: AbortSignal.timeout(Math.max(1,Math.floor(options?.timeoutMs ?? 300000))),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data = await res.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
      };
    };

    const choice = data.choices[0];
    return {
      content: choice?.message?.content ?? null,
      tool_calls: choice?.message?.tool_calls,
      stop_reason: choice?.finish_reason,
      usage: data.usage ? {
        prompt_tokens: data.usage.prompt_tokens,
        completion_tokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}
