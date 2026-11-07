import { all, get, run, tx } from "@/lib/db";
import { settingNumber, audit, type Actor } from "./core";
import { assert } from "../domain";

function makeActor(userId?: number): Actor {
  if (userId) {
    return { type: "USER", id: userId, name: "Quản lý kinh doanh", role: "SALES_MANAGER" };
  }
  return { type: "SYSTEM" };
}

export type PeriodType = "MONTH" | "QUARTER" | "YEAR";
export type PerformanceRating = "EXCELLENT" | "GOOD" | "AVERAGE" | "NEEDS_IMPROVEMENT";

export interface SalesTarget {
  id: number;
  period_type: PeriodType;
  period_name: string;
  user_id: number | null;
  user_name?: string | null;
  team_id: number | null;
  team_name?: string | null;
  target_amount: number;
  target_deals: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SetSalesTargetInput {
  periodType: PeriodType;
  periodName: string;
  userId?: number | null;
  teamId?: number | null;
  targetAmount: number;
  targetDeals?: number;
}

export interface PerformanceSummary {
  periodName: string;
  targetAmount: number;
  actualRevenue: number;
  completionPct: number;
  targetDeals: number;
  actualWonDeals: number;
  dealsCompletionPct: number;
  pipelineForecastAmount: number; // Dự báo theo BR-14
  openDealsCount: number;
}

export interface PerformanceReview {
  id: number;
  employee_id: number;
  employee_code?: string;
  employee_name?: string;
  reviewer_id: number;
  reviewer_name?: string;
  period_name: string;
  actual_revenue: number;
  target_revenue: number;
  completion_pct: number;
  rating: PerformanceRating;
  feedback: string | null;
  created_at: string;
}

export interface CreateReviewInput {
  employeeId: number;
  periodName: string;
  actualRevenue: number;
  targetRevenue: number;
  rating: PerformanceRating;
  feedback?: string | null;
}

// ==========================================
// 1. Chỉ tiêu doanh số (FR-85)
// ==========================================

/**
 * FR-85: Thiết lập chỉ tiêu doanh số cá nhân hoặc nhóm theo kỳ.
 * Ràng buộc: đúng một trong userId hoặc teamId được phép có giá trị.
 */
export function setSalesTarget(
  input: SetSalesTargetInput,
  actorUserId?: number,
): SalesTarget {
  const hasUser = input.userId !== undefined && input.userId !== null;
  const hasTeam = input.teamId !== undefined && input.teamId !== null;

  if ((hasUser && hasTeam) || (!hasUser && !hasTeam)) {
    throw new Error("Chỉ tiêu phải được áp dụng cho đúng một trong hai: Cá nhân hoặc Nhóm bán hàng.");
  }

  const cleanPeriod = input.periodName.trim().toUpperCase();
  const targetDeals = input.targetDeals ?? 0;

  return tx(() => {
    // Tìm bản ghi đã tồn tại
    const existing = get<{ id: number }>(
      `SELECT id FROM sales_targets
       WHERE period_type = ? AND period_name = ?
         AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))
         AND (team_id = ? OR (team_id IS NULL AND ? IS NULL))`,
      input.periodType,
      cleanPeriod,
      input.userId ?? null,
      input.userId ?? null,
      input.teamId ?? null,
      input.teamId ?? null,
    );

    let targetId = existing?.id;

    if (existing) {
      run(
        `UPDATE sales_targets
         SET target_amount = ?, target_deals = ?, updated_at = datetime('now')
         WHERE id = ?`,
        input.targetAmount,
        targetDeals,
        existing.id,
      );
    } else {
      const res = run(
        `INSERT INTO sales_targets (
          period_type, period_name, user_id, team_id, target_amount, target_deals, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        input.periodType,
        cleanPeriod,
        input.userId ?? null,
        input.teamId ?? null,
        input.targetAmount,
        targetDeals,
        actorUserId ?? 1,
      );
      targetId = res.id;
    }

    audit(makeActor(actorUserId), "sales_target", targetId!, existing ? "UPDATE" : "CREATE", {
      details: {
        periodName: cleanPeriod,
        targetAmount: input.targetAmount,
        userId: input.userId,
        teamId: input.teamId,
      },
    });

    return getSalesTarget(targetId!)!;
  });
}

export function getSalesTarget(id: number): SalesTarget | undefined {
  return get<SalesTarget>(
    `SELECT st.*, u.name as user_name, t.name as team_name
     FROM sales_targets st
     LEFT JOIN users u ON u.id = st.user_id
     LEFT JOIN teams t ON t.id = st.team_id
     WHERE st.id = ?`,
    id,
  );
}

export function listSalesTargets(filters?: {
  periodType?: PeriodType;
  periodName?: string;
  userId?: number;
  teamId?: number;
}): SalesTarget[] {
  let sql = `
    SELECT st.*, u.name as user_name, t.name as team_name
    FROM sales_targets st
    LEFT JOIN users u ON u.id = st.user_id
    LEFT JOIN teams t ON t.id = st.team_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters?.periodType) {
    sql += " AND st.period_type = ?";
    params.push(filters.periodType);
  }
  if (filters?.periodName) {
    sql += " AND st.period_name = ?";
    params.push(filters.periodName);
  }
  if (filters?.userId) {
    sql += " AND st.user_id = ?";
    params.push(filters.userId);
  }
  if (filters?.teamId) {
    sql += " AND st.team_id = ?";
    params.push(filters.teamId);
  }

  sql += " ORDER BY st.period_name DESC, st.target_amount DESC";
  return all<SalesTarget>(sql, ...params);
}

// ==========================================
// 2. Theo dõi mức hoàn thành & Dự báo (FR-86, BR-14)
// ==========================================

/**
 * FR-86: Theo dõi mức hoàn thành chỉ tiêu theo quy tắc BR-14:
 * - Mức hoàn thành = tổng giá trị đơn hàng của cơ hội thắng trong kỳ / chỉ tiêu.
 * - Dự báo = Σ doanh thu ước tính × xác suất theo giai đoạn:
 *   Phát triển cơ hội (20%), Đề xuất giải pháp (50%), Tạo đơn hàng (80%).
 */
export function getPerformanceSummary(params: {
  periodName: string;
  userId?: number | null;
  teamId?: number | null;
}): PerformanceSummary {
  // 1. Lấy chỉ tiêu doanh số đã đặt
  let targetSql = "SELECT * FROM sales_targets WHERE period_name = ?";
  const targetParams: (string | number)[] = [params.periodName];

  if (params.userId) {
    targetSql += " AND user_id = ?";
    targetParams.push(params.userId);
  } else if (params.teamId) {
    targetSql += " AND team_id = ?";
    targetParams.push(params.teamId);
  }

  const target = get<SalesTarget>(targetSql, ...targetParams);
  const targetAmount = target?.target_amount ?? 0;
  const targetDeals = target?.target_deals ?? 0;
  const match=/^(\d{4})(?:-(?:Q([1-4])|(0[1-9]|1[0-2])))?$/.exec(params.periodName);
  assert(match,'Kỳ chỉ tiêu không hợp lệ');
  const year=Number(match[1]), month=match[2] ? (Number(match[2])-1)*3 : match[3] ? Number(match[3])-1 : 0;
  const months=match[2] ? 3 : match[3] ? 1 : 12;
  const start=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
  const end=new Date(Date.UTC(year,month+months,1)).toISOString().slice(0,10);

  // 2. Doanh số thực tế từ cơ hội thắng (WON) hoặc đơn hàng
  let wonSql = `
    SELECT
      COALESCE(SUM(ord.value), 0) as actual_revenue,
      COUNT(o.id) as actual_deals
    FROM opportunities o
    JOIN (SELECT opportunity_id,SUM(COALESCE(NULLIF(grand_total,0),total)) value FROM orders WHERE status!='CANCELLED' GROUP BY opportunity_id) ord ON ord.opportunity_id=o.id
    WHERE o.stage = 'WON' AND date(o.closed_at)>=? AND date(o.closed_at)<?
  `;
  const wonParams: (string | number)[] = [start,end];

  if (params.userId) {
    wonSql += " AND o.owner_id = ?";
    wonParams.push(params.userId);
  } else if (params.teamId) {
    wonSql += ` AND (o.team_id = ? OR o.owner_id IN (
      SELECT user_id FROM team_members WHERE team_id = ? AND (valid_to IS NULL OR valid_to > datetime('now'))
    ))`;
    wonParams.push(params.teamId, params.teamId);
  }

  const wonResult = get<{ actual_revenue: number; actual_deals: number }>(wonSql, ...wonParams);
  const actualRevenue = wonResult?.actual_revenue ?? 0;
  const actualWonDeals = wonResult?.actual_deals ?? 0;

  const completionPct = targetAmount > 0 ? (actualRevenue / targetAmount) * 100 : 0;
  const dealsCompletionPct = targetDeals > 0 ? (actualWonDeals / targetDeals) * 100 : 0;

  // 3. Tính dự báo doanh số bán hàng (BR-14)
  const probDevelop = (settingNumber("forecast_prob_develop")) / 100;
  const probPropose = (settingNumber("forecast_prob_propose")) / 100;
  const probClose = (settingNumber("forecast_prob_close")) / 100;

  let openSql = `
    SELECT stage, amount
    FROM opportunities
    WHERE stage IN ('DEVELOP', 'PROPOSE', 'CLOSE')
  `;
  const openParams: (string | number)[] = [];

  if (params.userId) {
    openSql += " AND owner_id = ?";
    openParams.push(params.userId);
  } else if (params.teamId) {
    openSql += ` AND (team_id = ? OR owner_id IN (
      SELECT user_id FROM team_members WHERE team_id = ? AND (valid_to IS NULL OR valid_to > datetime('now'))
    ))`;
    openParams.push(params.teamId, params.teamId);
  }

  const openDeals = all<{ stage: string; amount: number }>(openSql, ...openParams);
  let pipelineForecastAmount = 0;

  for (const deal of openDeals) {
    if (deal.stage === "DEVELOP") {
      pipelineForecastAmount += deal.amount * probDevelop;
    } else if (deal.stage === "PROPOSE") {
      pipelineForecastAmount += deal.amount * probPropose;
    } else if (deal.stage === "CLOSE") {
      pipelineForecastAmount += deal.amount * probClose;
    }
  }

  return {
    periodName: params.periodName,
    targetAmount,
    actualRevenue,
    completionPct: Math.round(completionPct * 10) / 10,
    targetDeals,
    actualWonDeals,
    dealsCompletionPct: Math.round(dealsCompletionPct * 10) / 10,
    pipelineForecastAmount: Math.round(pipelineForecastAmount),
    openDealsCount: openDeals.length,
  };
}

// ==========================================
// 3. Đánh giá hiệu suất bán hàng (FR-87)
// ==========================================

/**
 * FR-87: Đánh giá hiệu suất bán hàng cho nhân viên theo kỳ.
 * Lưu ý: Không dùng để đánh giá chất lượng đầu ra của AI Agent.
 */
export function createPerformanceReview(
  input: CreateReviewInput,
  reviewerUserId: number,
): PerformanceReview {
  const completionPct = input.targetRevenue > 0
    ? (input.actualRevenue / input.targetRevenue) * 100
    : 0;

  return tx(() => {
    const res = run(
      `INSERT INTO performance_reviews (
        employee_id, reviewer_id, period_name, actual_revenue, target_revenue, completion_pct, rating, feedback
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.employeeId,
      reviewerUserId,
      input.periodName.trim().toUpperCase(),
      input.actualRevenue,
      input.targetRevenue,
      Math.round(completionPct * 10) / 10,
      input.rating,
      input.feedback?.trim() ?? null,
    );

    audit(makeActor(reviewerUserId), "performance_review", res.id, "CREATE", {
      details: {
        employeeId: input.employeeId,
        periodName: input.periodName,
        rating: input.rating,
      },
    });

    return getPerformanceReview(res.id)!;
  });
}

export function getPerformanceReview(id: number): PerformanceReview | undefined {
  return get<PerformanceReview>(
    `SELECT pr.*, e.code as employee_code, e.full_name as employee_name, u.name as reviewer_name
     FROM performance_reviews pr
     JOIN employees e ON e.id = pr.employee_id
     JOIN users u ON u.id = pr.reviewer_id
     WHERE pr.id = ?`,
    id,
  );
}

export function listPerformanceReviews(filters?: {
  employeeId?: number;
  periodName?: string;
}): PerformanceReview[] {
  let sql = `
    SELECT pr.*, e.code as employee_code, e.full_name as employee_name, u.name as reviewer_name
    FROM performance_reviews pr
    JOIN employees e ON e.id = pr.employee_id
    JOIN users u ON u.id = pr.reviewer_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters?.employeeId) {
    sql += " AND pr.employee_id = ?";
    params.push(filters.employeeId);
  }
  if (filters?.periodName) {
    sql += " AND pr.period_name = ?";
    params.push(filters.periodName);
  }

  sql += " ORDER BY pr.created_at DESC";
  return all<PerformanceReview>(sql, ...params);
}
