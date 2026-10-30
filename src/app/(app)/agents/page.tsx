import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/domain";
import { AGENT_PROFILES, agentLimits, agentRuntimeInfo, agentStats, agentTools, controlLayerStats, preRunStatus, recentRuns, type AgentProfile } from "@/lib/agents/catalog";
import { OPPORTUNITY_RULES, fillLogic } from "@/lib/agents/rules";
import { settingNumber } from "@/lib/services/core";
import { ControlLayers, ImportanceScale, RuleLogicMatrix } from "@/components/agent-controls";
import { Card, CommandBar, CommandLink, Kpi, PageTitle, StatusBadge } from "@/components/ui";
import { OwnerBadge, WorkflowSteps, OWNER, type FlowOwner } from "@/components/agent-workflow";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Trung tâm AI Agent" };

const AGENT_LABEL: Record<string, string> = { QUALIFICATION: "Qualification", OPPORTUNITY: "Opportunity" };

export default async function AgentsPage({ searchParams }: PageProps<"/agents">) {
  const user = await requireUser();
  const sp = (await searchParams) as { agent?: string };
  const info = agentRuntimeInfo();
  const current = AGENT_PROFILES.find((a) => a.name === sp.agent) ?? AGENT_PROFILES[1];
  const limits = agentLimits();

  return (
    <>
      <CommandBar>
        <CommandLink href="/agents?agent=QUALIFICATION" icon="lead">Qualification Agent</CommandLink>
        <CommandLink href="/agents?agent=OPPORTUNITY" icon="opportunity">Opportunity Agent</CommandLink>
        <CommandLink href="/ai-review" icon="sparkle">Kiểm duyệt AI</CommandLink>
      </CommandBar>
      <PageTitle
        title="Trung tâm AI Agent"
        subtitle="LLM chọn bước và diễn giải · Backend sở hữu quy tắc, quyền và giới hạn · Con người quyết định"
        icon="bot"
        right={
          <span className="text-xs text-ink-3">
            Chế độ: <b className="text-ink">{info.mode === "llm" ? "OpenAI (chạy thật)" : "Mock (không cần khoá API)"}</b> · Prompt {info.prompts.QUALIFICATION} / {info.prompts.OPPORTUNITY} · Bộ quy tắc {info.ruleset}
          </span>
        }
      />
      <div className="space-y-6 px-6 pb-12">
        {/* 1. Hai Agent trong quy trình Sales */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {AGENT_PROFILES.map((a) => {
            const s = agentStats(a.name, user);
            const active = a.name === current.name;
            return (
              <Link key={a.name} href={`/agents?agent=${a.name}`} className={`block rounded-lg border bg-surface p-4 shadow-[var(--shadow-4)] transition-shadow hover:shadow-[var(--shadow-16)] ${active ? "border-[#0f6cbd] ring-2 ring-[#ebf3fc]" : "border-transparent"}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f1ebf9] text-[#5c2e91]"><Icon name="bot" size={22} /></div>
                  <div className="min-w-0">
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-ink-3">Giai đoạn {a.stage}</div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink-2">{a.mission}</p>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <Stat label="Lần chạy 7 ngày" value={s.total} />
                  <Stat label="Thành công" value={s.total ? `${Math.round((s.ok / s.total) * 100)}%` : "—"} />
                  <Stat label="Chờ người duyệt" value={s.pending} />
                  <Stat label="Bị chặn quyền" value={s.denied} />
                </div>
              </Link>
            );
          })}
        </div>

        {/* 2. Ai làm gì */}
        <Card title="Phân vai: ai làm bước nào">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {(Object.keys(OWNER) as FlowOwner[]).map((o) => (
              <div key={o} className="rounded-md border border-[#f0f0f0] p-3 text-sm">
                <OwnerBadge owner={o} />
                <p className="mt-2 text-ink-2">{ROLE_TEXT[o]}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* 2b. Các lớp kiểm soát */}
        <Card title="6 lớp kiểm soát Agent — yêu cầu đi qua lớp nào, bị chặn ở đâu">
          <ControlLayers
            stats={controlLayerStats(user)}
            preRun={AGENT_PROFILES.map((a) => ({ name: a.title.replace("Sales ", ""), ...preRunStatus(a.name) }))}
          />
        </Card>

        {/* 2c. Logic quyết định của Opportunity Agent */}
        {current.name === "OPPORTUNITY" && (
          <Card title={`Logic quyết định — bộ quy tắc ${info.ruleset} (backend tính, LLM không được đổi)`}>
            <RuleLogicMatrix rules={OPPORTUNITY_RULES.map((r) => ({ id: r.id, br: r.br, title: r.title, logic: { input: r.logic.input, missing: "missing" in r.logic ? fillLogic(r.logic.missing) : undefined, hit: "hit" in r.logic ? fillLogic(r.logic.hit) : undefined, warn: "warn" in r.logic ? fillLogic(r.logic.warn) : undefined, pass: fillLogic(r.logic.pass) } }))} />
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-md border border-[#f0f0f0] p-3">
                <div className="label">Mức quan trọng (OPP-R01, BR-08)</div>
                <ImportanceScale medium={settingNumber("importance_medium_amount")} high={settingNumber("importance_high_amount")} />
                <p className="text-[11px] text-ink-3">Khách ≥ {settingNumber("segment_enterprise_min_employees")} nhân sự (Enterprise) luôn là CAO.</p>
              </div>
              <div className="rounded-md border border-[#f0f0f0] p-3 text-sm">
                <div className="label">3 hành động ưu tiên</div>
                <ol className="list-decimal space-y-0.5 pl-5 text-[13px]">
                  <li>Quy tắc <b className="text-[#a4262c]">Vi phạm</b> trước</li>
                  <li>Rồi <b className="text-[#8a5300]">Cảnh báo</b>, <b className="text-[#605e5c]">Thiếu dữ liệu</b></li>
                  <li>Cùng nhóm: mức CAO › TRUNG BÌNH › THẤP</li>
                </ol>
                <p className="mt-1 text-[11px] text-ink-3">Lấy 3 việc đầu; phần còn lại vào &ldquo;hành động bổ sung&rdquo;.</p>
              </div>
              <div className="rounded-md border border-[#f0f0f0] p-3 text-sm">
                <div className="label">Độ bao phủ dữ liệu</div>
                <div className="rounded bg-[#fafafa] px-2 py-1.5 text-center font-mono text-[13px]">quy tắc đánh giá được ÷ quy tắc áp dụng</div>
                <p className="mt-1 text-[11px] text-ink-3">≥ 0,8 cao · ≥ {settingNumber("ai_min_confidence") || 0.6} trung bình · thấp hơn → gắn cờ cần bổ sung dữ liệu. Không phải &ldquo;xác suất AI đúng&rdquo;.</p>
              </div>
            </div>
          </Card>
        )}

        {/* 3. Workflow của Agent đang chọn */}
        <Card title={<span>Workflow của {current.title}</span>}>
          <WorkflowSteps steps={current.workflow} />
        </Card>

        {/* 4. Thành phần của Agent */}
        <AgentAnatomy agent={current} refreshHours={info.refreshHours} />

        {/* 5. Giới hạn vận hành */}
        <Card title="Giới hạn vận hành chung (đọc từ cấu hình hiện hành)">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {limits.map((l) => <Kpi key={l.label} label={l.label} value={l.value} sub={l.source} icon="shield" />)}
          </div>
          <p className="mt-3 text-xs text-ink-3">Vượt giới hạn → lần chạy dừng với trạng thái FAILED và lý do, không tạo kết quả. Người quản lý tác nhân AI chỉnh ở trang Quản trị AI.</p>
        </Card>

        {/* 6. Lần chạy gần đây */}
        <Card title="Lần chạy gần đây" pad={false}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr><th className="px-4 py-2">Lần chạy</th><th className="px-4 py-2">Agent</th><th className="px-4 py-2">Hồ sơ</th><th className="px-4 py-2">Kích hoạt</th><th className="px-4 py-2">Trạng thái</th><th className="px-4 py-2">Kết quả</th></tr>
            </thead>
            <tbody>
              {recentRuns(user).map((r) => (
                <tr key={r.id} className="border-t border-[#f0f0f0] align-top">
                  <td className="px-4 py-2 whitespace-nowrap">#{r.id}<div className="text-xs text-ink-3">{formatDate(r.started_at, true)}</div></td>
                  <td className="px-4 py-2">{AGENT_LABEL[r.agent] ?? r.agent}<div className="text-xs text-ink-3">{r.model}</div></td>
                  <td className="px-4 py-2"><Link className="link" href={r.entity_type === "lead" ? `/leads/${r.entity_id}` : `/opportunities/${r.entity_id}?tab=research`}>{r.entity_type === "lead" ? "Lead" : "Cơ hội"} #{r.entity_id}</Link></td>
                  <td className="px-4 py-2 text-xs">{r.trigger}</td>
                  <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2 text-xs text-ink-2">{r.error ?? r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

const ROLE_TEXT: Record<FlowOwner, string> = {
  SYSTEM: "Kích hoạt, kiểm tra an toàn trước khi chạy, cấp quyền công cụ, che dữ liệu nhạy cảm trong log, xác thực căn cứ, lưu và audit.",
  LLM: "Chọn công cụ cần gọi, đọc dữ liệu, diễn giải kết quả đã khóa, viết tóm tắt và insight. Không đặt ngưỡng, không duyệt.",
  RULES: "Tính BANT, mức quan trọng, rủi ro có mã, thứ tự hành động, cổng duyệt, độ bao phủ dữ liệu — cùng dữ liệu luôn ra cùng kết quả.",
  HUMAN: "Duyệt email, loại / chuyển đổi Lead, xác minh nghiên cứu, xử lý rủi ro, rà soát chuyển giai đoạn. Quyết định cuối thuộc về người.",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-[#fafafa] px-2 py-1.5">
      <div className="text-[18px] font-semibold leading-6">{value}</div>
      <div className="text-ink-3">{label}</div>
    </div>
  );
}

function AgentAnatomy({ agent, refreshHours }: { agent: AgentProfile; refreshHours: number }) {
  const tools = agentTools(agent.name);
  const reads = tools.filter((t) => t.access === "READ");
  const writes = tools.filter((t) => t.access === "WRITE");
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card title="1 · Nhiệm vụ & kích hoạt">
        <p className="text-sm text-ink-2">{agent.mission}</p>
        <div className="label mt-3">Chạy khi</div>
        <ul className="list-disc space-y-0.5 pl-5 text-sm">{agent.triggers.map((t) => <li key={t}>{t.replace("{h}", String(refreshHours))}</li>)}</ul>
        <div className="label mt-3">Được đọc</div>
        <ul className="list-disc space-y-0.5 pl-5 text-sm">{agent.reads.map((t) => <li key={t}>{t}</li>)}</ul>
      </Card>
      <Card title={`2 · Công cụ (${tools.length}: ${reads.length} đọc, ${writes.length} ghi)`}>
        <ToolList title="Đọc" tone="text-[#0f6cbd]" items={reads} />
        <ToolList title="Ghi (chỉ tạo đề xuất / bản chờ duyệt)" tone="text-[#8a5300]" items={writes} />
        <p className="mt-2 text-xs text-ink-3">Quyền được kiểm ở server cho từng lần gọi; công cụ ngoài danh sách bị chặn và ghi DENIED.</p>
      </Card>
      <Card title={`3 · Quy tắc (${agent.rules.length})`}>
        <ul className="space-y-1.5 text-sm">
          {agent.rules.map((r) => (
            <li key={r.id} className="flex gap-2"><code className="shrink-0 text-[11px] text-ink-3">{r.id}</code><span>{r.title} <span className="text-xs text-ink-3">({r.source})</span></span></li>
          ))}
        </ul>
      </Card>
      <Card title="4 · Không được làm">
        <ul className="space-y-1 text-sm">{agent.forbidden.map((t) => <li key={t} className="flex gap-2"><Icon name="dismissCircle" size={16} className="mt-0.5 shrink-0 text-[#c50f1f]" />{t}</li>)}</ul>
      </Card>
      <Card title="5 · Cổng con người">
        <ul className="space-y-1.5 text-sm">{agent.gates.map((g) => <li key={g.code} className="flex gap-2"><code className="shrink-0 text-[11px] text-[#107c10]">{g.code}</code><span>{g.title} — <b>{g.who}</b></span></li>)}</ul>
      </Card>
      <Card title="6 · Đầu ra & dấu vết">
        <ul className="list-disc space-y-0.5 pl-5 text-sm">{agent.outputs.map((t) => <li key={t}><code className="text-[12px]">{t}</code></li>)}</ul>
        <p className="mt-2 text-xs text-ink-3">Mỗi lần chạy lưu ở <code>ai_runs</code> + <code>tool_calls</code>: người/sự kiện kích hoạt, model, token, chi phí, công cụ đã gọi.</p>
      </Card>
    </div>
  );
}

function ToolList({ title, tone, items }: { title: string; tone: string; items: { name: string; description: string }[] }) {
  return (
    <div className="mb-2">
      <div className={`label ${tone}`}>{title}</div>
      <ul className="space-y-1">
        {items.map((t) => <li key={t.name} className="text-xs"><code className="text-[11px] font-semibold">{t.name}</code><div className="text-ink-3">{t.description}</div></li>)}
      </ul>
    </div>
  );
}
