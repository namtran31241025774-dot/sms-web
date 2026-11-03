import { all } from "../db";
import { OPP_STAGE } from "../domain";
import { settingNumber } from "./core";

export interface StageSummary {
  stage: string;
  stageName: string;
  count: number;
  totalAmount: number;
  probabilityPct: number;
  weightedAmount: number;
}

export interface TeamPipelineSummary {
  teamId: number | null;
  teamCode: string;
  teamName: string;
  oppCount: number;
  totalAmount: number;
  weightedForecast: number;
  wonAmount: number;
}

export interface OwnerPipelineSummary {
  ownerId: number;
  ownerName: string;
  ownerEmail: string;
  oppCount: number;
  totalAmount: number;
  weightedForecast: number;
  wonAmount: number;
}

export interface PipelineReport {
  totalOpportunities: number;
  openOpportunities: number;
  totalPipelineValue: number;
  weightedForecastRevenue: number;
  wonValue: number;
  lostValue: number;
  winRatePct: number;
  stages: StageSummary[];
  byTeam: TeamPipelineSummary[];
  byOwner: OwnerPipelineSummary[];
}

export interface PipelineFilter {
  team_id?: number;
  owner_id?: number;
  from_date?: string;
  to_date?: string;
}

/**
 * Trọng số dự báo doanh thu Pipeline theo chuẩn BR-14.
 */
export const STAGE_PROBABILITIES: Record<string, number> = {
  DEVELOP: 20, // Phát triển cơ hội: 20%
  PROPOSE: 50, // Đề xuất giải pháp: 50%
  CLOSE: 80,   // Tạo đơn hàng / Đàm phán: 80%
  WON: 100,    // Đã thắng: 100%
  LOST: 0,     // Đã thua: 0%
};

/**
 * Tổng hợp báo cáo phễu cơ hội và dự báo doanh số theo BR-14 (FR-99).
 */
export function getPipelineFunnelReport(filter?: PipelineFilter): PipelineReport {
  const probabilities: Record<string,number> = {...STAGE_PROBABILITIES,
    DEVELOP:settingNumber('forecast_prob_develop'),PROPOSE:settingNumber('forecast_prob_propose'),CLOSE:settingNumber('forecast_prob_close')};
  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (filter?.team_id) {
    where.push("o.team_id = ?");
    params.push(filter.team_id);
  }

  if (filter?.owner_id) {
    where.push("o.owner_id = ?");
    params.push(filter.owner_id);
  }

  if (filter?.from_date) {
    where.push("o.created_at >= ?");
    params.push(filter.from_date);
  }

  if (filter?.to_date) {
    where.push("o.created_at <= ?");
    params.push(`${filter.to_date} 23:59:59`);
  }

  const whereSql = where.join(" AND ");

  // 1. Thống kê theo từng giai đoạn
  const rawStages = all<{ stage: string; count: number; total_amount: number }>(
    `SELECT 
       o.stage, 
       COUNT(*) AS count, 
       COALESCE(SUM(o.amount), 0) AS total_amount
     FROM opportunities o
     WHERE ${whereSql}
     GROUP BY o.stage`,
    ...params,
  );

  const stageOrder = ["DEVELOP", "PROPOSE", "CLOSE", "WON", "LOST"];
  const stages: StageSummary[] = stageOrder.map((stageKey) => {
    const found = rawStages.find((s) => s.stage === stageKey);
    const count = found?.count ?? 0;
    const totalAmount = found?.total_amount ?? 0;
    const probabilityPct = probabilities[stageKey] ?? 0;
    const weightedAmount = Math.round((totalAmount * probabilityPct) / 100);

    return {
      stage: stageKey,
      stageName: OPP_STAGE[stageKey] ?? stageKey,
      count,
      totalAmount,
      probabilityPct,
      weightedAmount,
    };
  });

  // 2. Tính các chỉ số tổng hợp
  const totalOpportunities = stages.reduce((acc, s) => acc + s.count, 0);
  const openStages = stages.filter((s) => s.stage !== "WON" && s.stage !== "LOST");
  const openOpportunities = openStages.reduce((acc, s) => acc + s.count, 0);
  const totalPipelineValue = openStages.reduce((acc, s) => acc + s.totalAmount, 0);
  const weightedForecastRevenue = openStages.reduce((acc, s) => acc + s.weightedAmount, 0);

  const wonStage = stages.find((s) => s.stage === "WON");
  const lostStage = stages.find((s) => s.stage === "LOST");
  const wonValue = wonStage?.totalAmount ?? 0;
  const lostValue = lostStage?.totalAmount ?? 0;

  const closedCount = (wonStage?.count ?? 0) + (lostStage?.count ?? 0);
  const winRatePct = closedCount > 0 ? Math.round(((wonStage?.count ?? 0) / closedCount) * 100) : 0;

  // 3. Phân bổ theo Sale Pod (Nhóm bán hàng)
  const byTeamRaw = all<{
    team_id: number | null;
    team_code: string | null;
    team_name: string | null;
    opp_count: number;
    total_amount: number;
    develop_amount: number;
    propose_amount: number;
    close_amount: number;
    won_amount: number;
  }>(
    `SELECT 
       t.id AS team_id,
       COALESCE(t.code, 'CHUA_GAN') AS team_code,
       COALESCE(t.name, 'Chưa phân nhóm') AS team_name,
       COUNT(o.id) AS opp_count,
       COALESCE(SUM(CASE WHEN o.stage NOT IN ('WON','LOST') THEN o.amount ELSE 0 END), 0) AS total_amount,
       COALESCE(SUM(CASE WHEN o.stage = 'DEVELOP' THEN o.amount ELSE 0 END), 0) AS develop_amount,
       COALESCE(SUM(CASE WHEN o.stage = 'PROPOSE' THEN o.amount ELSE 0 END), 0) AS propose_amount,
       COALESCE(SUM(CASE WHEN o.stage = 'CLOSE' THEN o.amount ELSE 0 END), 0) AS close_amount,
       COALESCE(SUM(CASE WHEN o.stage = 'WON' THEN o.amount ELSE 0 END), 0) AS won_amount
     FROM opportunities o
     LEFT JOIN teams t ON t.id = o.team_id
     WHERE ${whereSql}
     GROUP BY t.id, t.code, t.name
     ORDER BY total_amount DESC`,
    ...params,
  );

  const byTeam: TeamPipelineSummary[] = byTeamRaw.map((t) => ({
    teamId: t.team_id,
    teamCode: t.team_code ?? "CHUA_GAN",
    teamName: t.team_name ?? "Chưa phân nhóm",
    oppCount: t.opp_count,
    totalAmount: t.total_amount,
    weightedForecast: Math.round(
      t.develop_amount * 0.2 + t.propose_amount * 0.5 + t.close_amount * 0.8,
    ),
    wonAmount: t.won_amount,
  }));

  // 4. Phân bổ theo Nhân viên phụ trách (Owner)
  const byOwnerRaw = all<{
    owner_id: number;
    owner_name: string;
    owner_email: string;
    opp_count: number;
    total_amount: number;
    develop_amount: number;
    propose_amount: number;
    close_amount: number;
    won_amount: number;
  }>(
    `SELECT 
       u.id AS owner_id,
       u.name AS owner_name,
       u.email AS owner_email,
       COUNT(o.id) AS opp_count,
       COALESCE(SUM(CASE WHEN o.stage NOT IN ('WON','LOST') THEN o.amount ELSE 0 END), 0) AS total_amount,
       COALESCE(SUM(CASE WHEN o.stage = 'DEVELOP' THEN o.amount ELSE 0 END), 0) AS develop_amount,
       COALESCE(SUM(CASE WHEN o.stage = 'PROPOSE' THEN o.amount ELSE 0 END), 0) AS propose_amount,
       COALESCE(SUM(CASE WHEN o.stage = 'CLOSE' THEN o.amount ELSE 0 END), 0) AS close_amount,
       COALESCE(SUM(CASE WHEN o.stage = 'WON' THEN o.amount ELSE 0 END), 0) AS won_amount
     FROM opportunities o
     JOIN users u ON u.id = o.owner_id
     WHERE ${whereSql}
     GROUP BY u.id, u.name, u.email
     ORDER BY total_amount DESC`,
    ...params,
  );

  const byOwner: OwnerPipelineSummary[] = byOwnerRaw.map((u) => ({
    ownerId: u.owner_id,
    ownerName: u.owner_name,
    ownerEmail: u.owner_email,
    oppCount: u.opp_count,
    totalAmount: u.total_amount,
    weightedForecast: Math.round(
      u.develop_amount * 0.2 + u.propose_amount * 0.5 + u.close_amount * 0.8,
    ),
    wonAmount: u.won_amount,
  }));

  return {
    totalOpportunities,
    openOpportunities,
    totalPipelineValue,
    weightedForecastRevenue,
    wonValue,
    lostValue,
    winRatePct,
    stages,
    byTeam,
    byOwner,
  };
}

export interface ForecastDashboard {
  quarter: string;
  target: number | null;
  targetSource: string;
  wonInQuarter: number;
  weightedInQuarter: number;
  months: { month: string; won: number; weighted: number; count: number }[];
  attention: { id: number; code: string; name: string; stage: string; amount: number; closeDate: string | null; openRisks: number; overdue: boolean }[];
}

/** Dự báo quý hiện tại so với chỉ tiêu, theo tháng chốt dự kiến, và cơ hội cần chú ý (FR-99, BR-14). */
export function getForecastDashboard(filter?: PipelineFilter, today = new Date()): ForecastDashboard {
  const prob: Record<string, number> = {
    DEVELOP: settingNumber("forecast_prob_develop"), PROPOSE: settingNumber("forecast_prob_propose"), CLOSE: settingNumber("forecast_prob_close"), WON: 100,
  };
  const where = ["o.stage <> 'LOST'"];
  const params: (string | number)[] = [];
  if (filter?.team_id) { where.push("o.team_id = ?"); params.push(filter.team_id); }
  if (filter?.owner_id) { where.push("o.owner_id = ?"); params.push(filter.owner_id); }
  if (filter?.from_date) { where.push("o.created_at >= ?"); params.push(filter.from_date); }
  if (filter?.to_date) { where.push("o.created_at <= ?"); params.push(`${filter.to_date} 23:59:59`); }
  const rows = all<{ id: number; code: string; name: string; stage: string; amount: number; close_date: string | null; open_risks: number }>(
    `SELECT o.id, o.code, o.name, o.stage, o.amount, o.close_date,
       (SELECT COUNT(*) FROM opportunity_risks r WHERE r.opportunity_id = o.id AND r.status = 'OPEN') AS open_risks
     FROM opportunities o WHERE ${where.join(" AND ")}`,
    ...params,
  );

  const y = today.getFullYear();
  const q = Math.floor(today.getMonth() / 3) + 1;
  const quarter = `${y}-Q${q}`;
  const inQuarter = (d: string | null) => !!d && Number(d.slice(0, 4)) === y && Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1 === q;
  const weighted = (r: { stage: string; amount: number }) => Math.round((r.amount * (prob[r.stage] ?? 0)) / 100);

  const byMonth = new Map<string, { won: number; weighted: number; count: number }>();
  for (const r of rows) {
    if (!r.close_date) continue;
    const m = r.close_date.slice(0, 7);
    const cur = byMonth.get(m) ?? { won: 0, weighted: 0, count: 0 };
    if (r.stage === "WON") cur.won += r.amount;
    else cur.weighted += weighted(r);
    cur.count += 1;
    byMonth.set(m, cur);
  }

  let target: number | null = null;
  let targetSource = "Chưa đặt chỉ tiêu cho quý này";
  const sumTarget = (sql: string, ...p: (string | number)[]) => all<{ s: number | null }>(sql, ...p)[0]?.s ?? null;
  if (filter?.owner_id) {
    target = sumTarget("SELECT SUM(target_amount) s FROM sales_targets WHERE period_type='QUARTER' AND period_name=? AND user_id=?", quarter, filter.owner_id);
    if (target) targetSource = "Chỉ tiêu quý của nhân viên";
  } else if (filter?.team_id) {
    target = sumTarget("SELECT SUM(target_amount) s FROM sales_targets WHERE period_type='QUARTER' AND period_name=? AND team_id=?", quarter, filter.team_id);
    if (target) targetSource = "Chỉ tiêu quý của Sale Pod";
  } else {
    target = sumTarget("SELECT SUM(target_amount) s FROM sales_targets WHERE period_type='QUARTER' AND period_name=? AND team_id IS NOT NULL", quarter);
    if (target) targetSource = "Tổng chỉ tiêu quý của các Sale Pod";
  }

  const todayIso = today.toISOString().slice(0, 10);
  return {
    quarter,
    target,
    targetSource,
    wonInQuarter: rows.filter((r) => r.stage === "WON" && inQuarter(r.close_date)).reduce((s, r) => s + r.amount, 0),
    weightedInQuarter: rows.filter((r) => r.stage !== "WON" && inQuarter(r.close_date)).reduce((s, r) => s + weighted(r), 0),
    months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
    attention: rows
      .filter((r) => r.stage !== "WON" && (r.open_risks > 0 || (!!r.close_date && r.close_date < todayIso)))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((r) => ({ id: r.id, code: r.code, name: r.name, stage: r.stage, amount: r.amount, closeDate: r.close_date, openRisks: r.open_risks, overdue: !!r.close_date && r.close_date < todayIso })),
  };
}

/**
 * Trích xuất báo cáo cơ hội và dự báo doanh số ra tệp CSV (FR-99).
 */
export function exportPipelineReportCsv(report: PipelineReport): string {
  const lines: string[] = [];

  lines.push("BÁO CÁO PHỄU BÁN HÀNG VÀ DỰ BÁO DOANH THU (BR-14)");
  lines.push(`Tổng số cơ hội,${report.totalOpportunities}`);
  lines.push(`Cơ hội đang mở,${report.openOpportunities}`);
  lines.push(`Tổng giá trị Pipeline (VND),${report.totalPipelineValue}`);
  lines.push(`Dự báo doanh thu có trọng số (VND),${report.weightedForecastRevenue}`);
  lines.push(`Doanh thu chốt thành công (VND),${report.wonValue}`);
  lines.push(`Tỷ lệ chốt thắng (%),${report.winRatePct}%`);
  lines.push("");

  lines.push("CHI TIẾT THEO GIAI ĐOẠN PHỄU");
  lines.push("Giai đoạn,Tên giai đoạn,Số lượng cơ hội,Tổng giá trị (VND),Trọng số dự báo (%),Doanh thu dự báo (VND)");
  for (const s of report.stages) {
    lines.push(`"${s.stage}","${s.stageName}",${s.count},${s.totalAmount},${s.probabilityPct}%,${s.weightedAmount}`);
  }
  lines.push("");

  lines.push("DOANH THU THEO SALE POD");
  lines.push("Mã Pod,Tên Pod,Số cơ hội,Giá trị Pipeline (VND),Dự báo có trọng số (VND),Đã thắng (VND)");
  for (const t of report.byTeam) {
    lines.push(`"${t.teamCode}","${t.teamName}",${t.oppCount},${t.totalAmount},${t.weightedForecast},${t.wonAmount}`);
  }
  lines.push("");

  lines.push("DOANH THU THEO NHÂN VIÊN PHỤ TRÁCH");
  lines.push("Họ và tên,Email,Số cơ hội,Giá trị Pipeline (VND),Dự báo có trọng số (VND),Đã thắng (VND)");
  for (const o of report.byOwner) {
    lines.push(`"${o.ownerName}","${o.ownerEmail}",${o.oppCount},${o.totalAmount},${o.weightedForecast},${o.wonAmount}`);
  }

  return lines.join("\n");
}
