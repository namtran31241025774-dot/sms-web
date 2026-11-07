import { all, get } from "../db";

export interface AuditLogItem {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor_type: "USER" | "AI" | "INTEGRATION" | "SYSTEM";
  actor_id: number | null;
  actor_label: string;
  reason: string | null;
  details_json: string | null;
  created_at: string;
}

export interface AuditFilter {
  actor_type?: string;
  actor_label?: string;
  entity_type?: string;
  entity_id?: number;
  action?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

/**
 * Tra cứu danh sách nhật ký kiểm toán (FR-100, BR-20).
 * Cho phép lọc theo người thực hiện, đối tượng, hành động, khoảng thời gian.
 */
export function listAuditLogs(filter?: AuditFilter): { items: AuditLogItem[]; total: number } {
  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (filter?.actor_type) {
    where.push("actor_type = ?");
    params.push(filter.actor_type);
  }

  if (filter?.actor_label) {
    where.push("actor_label LIKE ?");
    params.push(`%${filter.actor_label.trim()}%`);
  }

  if (filter?.entity_type) {
    where.push("entity_type = ?");
    params.push(filter.entity_type);
  }

  if (filter?.entity_id) {
    where.push("entity_id = ?");
    params.push(filter.entity_id);
  }

  if (filter?.action) {
    where.push("action = ?");
    params.push(filter.action);
  }

  if (filter?.from_date) {
    where.push("created_at >= ?");
    params.push(filter.from_date);
  }

  if (filter?.to_date) {
    where.push("created_at <= ?");
    params.push(`${filter.to_date} 23:59:59`);
  }

  const whereSql = where.join(" AND ");

  const total =
    get<{ count: number }>(`SELECT COUNT(*) AS count FROM audit_log WHERE ${whereSql}`, ...params)?.count ?? 0;

  const limit = filter?.limit ?? 50;
  const offset = filter?.offset ?? 0;

  const items = all<AuditLogItem>(
    `SELECT * FROM audit_log 
     WHERE ${whereSql} 
     ORDER BY id DESC 
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  return { items, total };
}

/**
 * Chi tiết một dòng nhật ký kiểm toán kèm đối chiếu dữ liệu (FR-100).
 */
export function getAuditLog(id: number): AuditLogItem | null {
  return get<AuditLogItem>("SELECT * FROM audit_log WHERE id = ?", id) ?? null;
}

/**
 * Xuất dữ liệu nhật ký kiểm toán ra định dạng CSV (FR-100).
 */
export function exportAuditLogsCsv(filter?: AuditFilter): string {
  const { items } = listAuditLogs({ ...filter, limit: 1000, offset: 0 });

  const headers = [
    "ID",
    "Thời gian",
    "Tác nhân",
    "Loại tác nhân",
    "Đối tượng",
    "Mã ID đối tượng",
    "Hành động",
    "Trạng thái cũ",
    "Trạng thái mới",
    "Lý do",
  ];

  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = items.map((i) => [
    i.id,
    i.created_at,
    escapeCsv(i.actor_label),
    escapeCsv(i.actor_type),
    escapeCsv(i.entity_type),
    i.entity_id,
    escapeCsv(i.action),
    escapeCsv(i.from_status),
    escapeCsv(i.to_status),
    escapeCsv(i.reason),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
