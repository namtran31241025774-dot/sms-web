import { assertActorAccess } from "./access";
// Quản lý rủi ro cơ hội (FR-43, HG5)
import { all, get, run, tx } from "../db";
import { assert, stripAccents } from "../domain";
import { actorUserId, audit, type Actor } from "./core";

export type RiskStatus = "OPEN" | "MITIGATED" | "RESOLVED" | "DISMISSED";
export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";

export type OpportunityRisk = {
  id: number;
  opportunity_id: number;
  description: string;
  severity: RiskSeverity;
  status: RiskStatus;
  source: "USER" | "AI";
  resolution: string | null;
  dismiss_reason: string | null;
  created_by: number | null;
  created_at: string;
  resolved_by: number | null;
  resolved_at: string | null;
  creator_name?: string | null;
  responsible_user_id:number|null;
  responsible_name?:string|null;
  resolver_name?: string | null;
};

export function listRisks(opportunityId: number): OpportunityRisk[] {
  return all<OpportunityRisk>(
    `SELECT r.*, u1.name AS creator_name, u2.name AS resolver_name, u3.name AS responsible_name
     FROM opportunity_risks r
     LEFT JOIN users u1 ON u1.id = r.created_by
     LEFT JOIN users u2 ON u2.id = r.resolved_by
     LEFT JOIN users u3 ON u3.id = r.responsible_user_id
     WHERE r.opportunity_id = ?
     ORDER BY CASE r.status
       WHEN 'OPEN' THEN 1
       WHEN 'MITIGATED' THEN 2
       WHEN 'RESOLVED' THEN 3
       WHEN 'DISMISSED' THEN 4
       ELSE 5
     END, r.id DESC`,
    opportunityId,
  );
}

export function getRisk(id: number): OpportunityRisk | undefined {
  return get<OpportunityRisk>(
    `SELECT r.*, u1.name AS creator_name, u2.name AS resolver_name
     FROM opportunity_risks r
     LEFT JOIN users u1 ON u1.id = r.created_by
     LEFT JOIN users u2 ON u2.id = r.resolved_by
     WHERE r.id = ?`,
    id,
  );
}

export function addRisk(
  actor: Actor,
  opportunityId: number,
  input: { description: string; severity?: RiskSeverity; source?: "USER" | "AI" },
): { id: number } {
  assertActorAccess(actor, "opportunity", opportunityId);
  assert(actor.type==='USER' && ['SALES','SALES_MANAGER','PRESALES'].includes(actor.role),'Agent không được tự thêm rủi ro');
  assert(input.description?.trim(), "Mô tả rủi ro không được để trống");
  const severity: RiskSeverity = input.severity ?? "MEDIUM";
  const source = input.source ?? "USER";

  const { id } = run(
    `INSERT INTO opportunity_risks (opportunity_id, description, severity, status, source, created_by, created_at)
     VALUES (?, ?, ?, 'OPEN', ?, ?, datetime('now'))`,
    opportunityId,
    input.description.trim(),
    severity,
    source,
    actorUserId(actor),
  );

  audit(actor, "opportunity", opportunityId, "RISK_ADD", {
    details: { riskId: id, description: input.description.trim(), severity, source },
  });

  return { id };
}

/** Keep handled risks too: a refreshed research must not silently reopen an existing issue. */
export function findMatchingRisk(opportunityId:number,description:string) {
  const normalize=(s:string)=>stripAccents(s.normalize('NFKC').toLowerCase()).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  return listRisks(opportunityId).find(r=>normalize(r.description)===normalize(description));
}

export function updateRiskStatus(
  actor: Actor,
  opportunityId: number,
  riskId: number,
  status: RiskStatus,
  opts?: { resolution?: string; dismiss_reason?: string },
): void {
  assertActorAccess(actor, "opportunity", opportunityId);
  const risk = getRisk(riskId);
  assert(risk, "Không tìm thấy rủi ro");
  assert(risk.opportunity_id === opportunityId, "Rủi ro không thuộc cơ hội này");

  // Kiểm soát Cổng HG5: Bỏ qua rủi ro (DISMISSED) bắt buộc có lý do
  if (status === "DISMISSED") {
    assert(
      opts?.dismiss_reason && opts.dismiss_reason.trim().length > 0,
      "Cổng HG5: Bỏ qua rủi ro (DISMISSED) bắt buộc phải có lý do giải trình",
    );
  }

  if (status === "RESOLVED") {
    assert(
      opts?.resolution && opts.resolution.trim().length > 0,
      "Cần cung cấp phương án / kết quả giải quyết rủi ro",
    );
  }

  tx(() => {
    run(
      `UPDATE opportunity_risks
       SET status = ?,
           resolution = CASE WHEN ? = 'RESOLVED' THEN ? ELSE resolution END,
           dismiss_reason = CASE WHEN ? = 'DISMISSED' THEN ? ELSE dismiss_reason END,
           resolved_by = CASE WHEN ? IN ('RESOLVED', 'DISMISSED') THEN ? ELSE resolved_by END,
           resolved_at = CASE WHEN ? IN ('RESOLVED', 'DISMISSED') THEN datetime('now') ELSE resolved_at END
       WHERE id = ? AND opportunity_id = ?`,
      status,
      status,
      opts?.resolution?.trim() ?? null,
      status,
      opts?.dismiss_reason?.trim() ?? null,
      status,
      actorUserId(actor),
      status,
      riskId,
      opportunityId,
    );

    audit(actor, "opportunity", opportunityId, "RISK_STATUS_CHANGE", {
      from: risk.status,
      to: status,
      details: {
        riskId,
        resolution: opts?.resolution?.trim(),
        dismiss_reason: opts?.dismiss_reason?.trim(),
      },
    });
  });
}
