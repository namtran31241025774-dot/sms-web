import type { Role } from "./domain";

export interface ScopeRecord {
  owner_id?: number | null;
  team_id?: number | null;
  created_by?: number | null;
  presales_id?: number | null;
  /** Nhóm của người phụ trách, dùng khi hồ sơ chưa gắn team_id (Lead, cơ hội tạo từ quy trình thường). */
  owner_team_ids?: number[];
}

export interface UserScope {
  id: number;
  role: Role;
  teamIds?: number[];
}

// Hồ sơ có team_id thì theo nhóm đó, chưa có thì theo nhóm của người phụ trách.
function recordTeams(record: ScopeRecord): number[] {
  return record.team_id ? [record.team_id] : record.owner_team_ids ?? [];
}

/**
 * Kiểm tra xem người dùng có quyền xem bản ghi cụ thể theo phạm vi dữ liệu (FR-98).
 * - ADMIN, FINANCE, DELIVERY xem được toàn bộ trong phạm vi nghiệp vụ.
 * - SALES_MANAGER xem được các bản ghi trong các nhóm mình quản lý (hoặc toàn bộ nếu chưa phân nhóm).
 * - SALES xem được hồ sơ mình tạo/phụ trách hoặc cùng nhóm (Sale Pod).
 * - PRESALES xem được hồ sơ được phân công tư vấn giải pháp hoặc xem dùng chung.
 */
export function canSee(
  user: UserScope,
  record: ScopeRecord,
  managedTeamIds: number[] = [],
): boolean {
  // ADMIN và FINANCE có phạm vi toàn hệ thống
  if (user.role === "ADMIN" || user.role === "FINANCE" || user.role === "DELIVERY") {
    return true;
  }

  // Quản lý kinh doanh (SALES_MANAGER): thấy nếu trong nhóm quản lý hoặc nếu là quản lý chung
  if (user.role === "SALES_MANAGER") {
    if(record.owner_id===user.id) return true;
    const managed = managedTeamIds.length ? managedTeamIds : user.teamIds ?? [];
    return recordTeams(record).some((t) => managed.includes(t));
  }

  // Chuyên viên tư vấn (PRESALES)
  if (user.role === "PRESALES") {
    if (record.presales_id && record.presales_id === user.id) return true;
    if (record.team_id && user.teamIds?.includes(record.team_id)) return true;
    return record.owner_id === user.id;
  }

  // Nhân viên kinh doanh (SALES): hồ sơ mình phụ trách, tạo, hoặc cùng Sale Pod
  if (user.role === "SALES") {
    if (record.owner_id && record.owner_id === user.id) return true;
    if (recordTeams(record).some((t) => user.teamIds?.includes(t))) return true;
    // Nếu hồ sơ chưa gán phụ trách
    return false;
  }

  return false;
}

/**
 * Tạo mệnh đề WHERE SQL để lọc dữ liệu theo phạm vi người dùng (FR-98).
 */
export function scopeFilterSql(
  user: UserScope,
  tablePrefix = "",
): { sql: string; params: (number | string)[] } {
  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  if (user.role === "ADMIN" || user.role === "FINANCE" || user.role === "DELIVERY") {
    return { sql: "1=1", params: [] };
  }

  if (user.role === "PRESALES") {
    return {
      sql: `(${prefix}presales_id = ? OR ${prefix}owner_id = ?)`,
      params: [user.id, user.id],
    };
  }

  if (user.role === "SALES" || user.role === "SALES_MANAGER") {
    const teamClause = user.teamIds && user.teamIds.length > 0
      ? ` OR ${prefix}team_id IN (${user.teamIds.map(() => "?").join(",")})`
      : "";
    const teamParams = user.teamIds ?? [];

    return {
      sql: `(${prefix}owner_id = ?${teamClause})`,
      params: [user.id,...teamParams],
    };
  }

  return { sql: "0=1", params: [] };
}
