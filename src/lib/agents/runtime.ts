// Điều phối một lần chạy Agent: tạo bản ghi AIActionLog (ai_runs), kiểm soát ngân sách & Kill Switch,
// kết nối qua interface LlmProvider (OpenAI mặc định theo DEC-12) hoặc chế độ mock,
// ghi lại mọi lần gọi công cụ, token, latency, chi phí và kết quả (BR-16, BR-24, DEC-27).
import { get, run } from "../db";
import { z } from "zod";
import { DomainError } from "../domain";
import { getLlmProvider, type LlmMessage, type LlmToolDefinition } from "../llm";
import { setting, settingBool, settingNumber } from "../services/core";
import { checkPreRunConstraints, getActiveAgentConfig } from "../services/ai-admin";
import { invokeTool, TOOLS, toolsFor, type AgentName, type ToolCallLog, type ToolContext } from "./tools";
import { mockOpportunityAgent, mockQualificationAgent } from "./mock";
import { OPPORTUNITY_SYSTEM, QUALIFICATION_SYSTEM } from "./prompts";


export function agentMode(): "llm" | "mock" {
  if (process.env.SMS_AI_MODE === "mock") return "mock";
  if (process.env.OPENAI_API_KEY) return "llm";
  return "mock";
}

export type RunResult = { runId: number; status: "SUCCEEDED" | "FAILED"; summary: string };

export async function runAgent(
  agent: AgentName,
  entity: { type: "lead" | "opportunity"; id: number },
  trigger: string,
  triggeredBy: number | null,
): Promise<RunResult> {
  if((agent==='QUALIFICATION') !== (entity.type==='lead')) throw new DomainError('Agent không phù hợp loại hồ sơ');
  const constraints=checkPreRunConstraints(agent);
  if(!constraints.ok) throw new DomainError(constraints.reason || 'Không đủ điều kiện chạy Agent');
  const running=get<{id:number}>("SELECT id FROM ai_runs WHERE agent=? AND entity_type=? AND entity_id=? AND status='RUNNING'",agent,entity.type,entity.id);
  if(running) throw new DomainError('Hồ sơ đang có lần chạy Agent chưa hoàn thành');
  const recent=get<{id:number;status:'SUCCEEDED'|'FAILED';summary:string|null}>("SELECT id,status,summary FROM ai_runs WHERE agent=? AND entity_type=? AND entity_id=? AND status IN ('SUCCEEDED','FAILED') AND started_at>=datetime('now','-60 seconds') ORDER BY id DESC LIMIT 1",agent,entity.type,entity.id);
  if(recent && !trigger.startsWith('RETRY')) return {runId:recent.id,status:recent.status,summary:recent.summary ?? ''};
  const enabledKey = agent === "QUALIFICATION" ? "agent_qualification_enabled" : "agent_opportunity_enabled";
  if (!settingBool(enabledKey)) throw new DomainError("Agent đang bị Admin tắt");

  // Kiểm tra Kill Switch & Ngân sách token trước khi chạy (FR-93, BR-16)
  const preCheck = checkPreRunConstraints(agent);
  if (!preCheck.ok) {
    throw new DomainError(preCheck.reason || "Không đủ điều kiện khởi tạo lần chạy AI");
  }

  if (agent === "QUALIFICATION") {
    const l = get<{ status: string }>("SELECT status FROM leads WHERE id = ?", entity.id);
    if (!l || (l.status !== "OPEN" && l.status !== "WORKING")) throw new DomainError("Chỉ chạy Qualification Agent cho Lead đang mở");
  } else {
    const o = get<{ stage: string }>("SELECT stage FROM opportunities WHERE id = ?", entity.id);
    if (!o || !['DEVELOP','PROPOSE'].includes(o.stage)) throw new DomainError("Chỉ chạy Opportunity Agent ở DEVELOP hoặc PROPOSE");
  }

  // Lấy cấu hình phiên bản hiện hành (DEC-27)
  const activeConfig = getActiveAgentConfig(agent);
  const configId = activeConfig?.id ?? null;
  const allowedModels = setting("llm_allowed_models").split(",").map(m=>m.trim()).filter(Boolean);
  const modelToUse = activeConfig?.model_reference || allowedModels[0] || "";
  const instructions = activeConfig?.instructions || (agent === "QUALIFICATION" ? QUALIFICATION_SYSTEM : OPPORTUNITY_SYSTEM);

  const mode = agentMode();
  if (mode === "llm" && (!modelToUse || !allowedModels.includes(modelToUse))) throw new DomainError("Chưa cấu hình mô hình (model) được phép chạy thật");
  const startTime = Date.now();

  const { id: runId } = run(
    `INSERT INTO ai_runs (agent, trigger, entity_type, entity_id, model, config_id, triggered_by, status, started_at)
     VALUES (?,?,?,?,?,?,?, 'RUNNING', datetime('now'))`,
    agent, trigger, entity.type, entity.id, mode === "llm" ? modelToUse : "mock-rules-v1", configId, triggeredBy,
  );

  const ctx: ToolContext = { agent, runId, entityType: entity.type, entityId: entity.id };
  const log: ToolCallLog[] = [];

  let inputTokens = 0;
  let outputTokens = 0;
  let webSearchCalls = 0;

  try {
    let summary: string;
    let stopReason: string;

    if (mode === "llm") {
      const res = await runWithLlm(ctx, trigger, instructions, modelToUse, log, usage => {
        inputTokens = usage.prompt_tokens; outputTokens = usage.completion_tokens;
      });
      summary = res.summary;
      stopReason = res.stopReason;
      inputTokens = res.usage?.prompt_tokens ?? 0;
      outputTokens = res.usage?.completion_tokens ?? 0;
    } else {
      summary = agent === "QUALIFICATION"
        ? mockQualificationAgent(ctx, log)
        : mockOpportunityAgent(ctx, log);
      stopReason = "end_turn";
      // Ước lượng token và lượt tìm web cho mock
      inputTokens = 0;
      outputTokens = 0;
    }

    webSearchCalls = log.filter((l) => l.tool === "web_research" && l.ok).length;
    const latencyMs = Date.now() - startTime;

    // Tính chi phí theo BR-24 nếu có cấu hình đơn giá
    const cost = mode === 'mock' ? 0 : calculateCost(inputTokens, outputTokens, webSearchCalls);

    run(
      `UPDATE ai_runs
       SET status='SUCCEEDED', tool_calls_json=?, summary=?, stop_reason=?,
           input_tokens=?, output_tokens=?, web_search_calls=?, latency_ms=?, cost=?,
           finished_at=datetime('now')
       WHERE id=?`,
      JSON.stringify(log), summary, stopReason,
      inputTokens, outputTokens, webSearchCalls, latencyMs, cost,
      runId,
    );
    return { runId, status: "SUCCEEDED", summary };
  } catch (e) {
    webSearchCalls = log.filter(l=>l.tool === "web_research").length;
    const latencyMs = Date.now() - startTime;
    const message = e instanceof Error ? e.message : String(e);

    run(
      `UPDATE ai_runs
       SET status='FAILED', tool_calls_json=?, error=?,
           input_tokens=?, output_tokens=?, web_search_calls=?, latency_ms=?,
           finished_at=datetime('now')
       WHERE id=?`,
      JSON.stringify(log), message,
      inputTokens, outputTokens, webSearchCalls, latencyMs,
      runId,
    );
    console.error(`[agent ${agent} run ${runId}]`, e);
    return { runId, status: "FAILED", summary: message };
  }
}

function calculateCost(inTokens: number, outTokens: number, webSearches: number): number {
  const pIn = settingNumber("llm_price_input_per_mtok");
  const pOut = settingNumber("llm_price_output_per_mtok");
  const pSearch = settingNumber("llm_price_web_search_per_call");

  if (!pIn && !pOut && !pSearch) return 0;
  return (inTokens * (pIn || 0)) / 1_000_000 + (outTokens * (pOut || 0)) / 1_000_000 + webSearches * (pSearch || 0);
}

async function runWithLlm(
  ctx: ToolContext,
  trigger: string,
  systemPrompt: string,
  model: string,
  log: ToolCallLog[],
  onUsage: (usage: {prompt_tokens:number;completion_tokens:number})=>void,
) {
  const provider = getLlmProvider();
  const maxIterations = settingNumber("ai_max_iterations");

  const toolDefs: LlmToolDefinition[] = toolsFor(ctx.agent).map((name) => {
    const def = TOOLS[name];
    return {
      type: "function",
      function: {
        name,
        description: def.description,
        parameters: z.toJSONSchema(def.input),
      },
    };
  });

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Sự kiện kích hoạt: ${trigger}. Bản ghi: ${ctx.entityType} #${ctx.entityId}. Hãy thực hiện quy trình theo hướng dẫn và kết thúc bằng một đoạn tóm tắt ngắn bằng tiếng Việt.`,
    },
  ];

  const totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
  let stopReason = "unknown";
  let summary = "";
  let completed = false;
  const deadline = Date.now() + settingNumber("ai_run_timeout_sec") * 1000;

  for (let iter = 0; iter < maxIterations; iter++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new DomainError("Quá thời gian thực thi Agent");
    const res = await provider.chat(messages, toolDefs, { model, timeoutMs:remaining });
    if (res.usage) {
      totalUsage.prompt_tokens += res.usage.prompt_tokens;
      totalUsage.completion_tokens += res.usage.completion_tokens;
      onUsage(totalUsage);
    }
    if (totalUsage.prompt_tokens + totalUsage.completion_tokens > settingNumber("ai_max_tokens_per_run")) throw new DomainError("Vượt giới hạn token mỗi lần chạy (BR-24)");
    stopReason = res.stop_reason || "unknown";

    if (res.tool_calls && res.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: res.content,
        tool_calls: res.tool_calls,
      });

      for (const tc of res.tool_calls) {
        if (tc.function.name === "web_research" && log.filter(l=>l.tool === "web_research").length >= settingNumber("ai_max_web_searches_per_run")) throw new DomainError("Vượt giới hạn lượt tìm web (BR-24)");
        let toolResult: unknown;
        try {
          const parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          toolResult = invokeTool(ctx, tc.function.name, parsedArgs, log);
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : String(err) };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(toolResult),
        });
      }
    } else {
      summary = res.content || "(không có nội dung phản hồi)";
      completed = true;
      break;
    }
  }

  if (!completed) throw new DomainError("Vượt giới hạn số vòng gọi công cụ (BR-24)");
  return { summary, stopReason, usage: totalUsage };
}
