import type { DatabaseSync } from "node:sqlite";

export function seedWp07(db: DatabaseSync) {
  const ins = (sql: string, ...p: (string | number | null)[]) =>
    Number(db.prepare(sql).run(...p).lastInsertRowid);

  // 1. Hồ sơ nhân viên (FR-75, FR-77, FR-78)
  const employees = [
    {
      code: "EMP-001",
      full_name: "Nguyễn Văn An",
      email: "an.nguyen@sms.local",
      phone: "0901234567",
      title: "SDR (Sales Development Rep)",
      business_role: "SALES",
      status: "ACTIVE",
      can_accept_work: 1,
      notes: "Chuyên tiếp cận, sàng lọc và nuôi dưỡng Lead mới",
    },
    {
      code: "EMP-002",
      full_name: "Trần Thị Bình",
      email: "binh.tran@sms.local",
      phone: "0902345678",
      title: "Account Executive (AE)",
      business_role: "SALES",
      status: "ACTIVE",
      can_accept_work: 1,
      notes: "Phát triển cơ hội bán hàng, đàm phán giải pháp và chốt hợp đồng",
    },
    {
      code: "EMP-003",
      full_name: "Lê Minh Châu",
      email: "chau.le@sms.local",
      phone: "0903456789",
      title: "Chuyên viên tư vấn giải pháp (SE)",
      business_role: "PRESALES",
      status: "ACTIVE",
      can_accept_work: 1,
      notes: "Demo sản phẩm, tư vấn kiến trúc giải pháp và tích hợp hệ thống",
    },
    {
      code: "EMP-005",
      full_name: "Phạm Quốc Dũng",
      email: "dung.pham@sms.local",
      phone: "0905678901",
      title: "Quản lý kinh doanh",
      business_role: "SALES_MANAGER",
      status: "ACTIVE",
      can_accept_work: 1,
      notes: "Quản lý các Sale Pods, phân công khách hàng, duyệt chiết khấu",
    },
    {
      code: "EMP-006",
      full_name: "Võ Thu Hà",
      email: "ha.vo@sms.local",
      phone: "0906789012",
      title: "Nhân viên Tài chính – Kế toán",
      business_role: "FINANCE",
      status: "ACTIVE",
      can_accept_work: 1,
      notes: "Lập và theo dõi hóa đơn, đối soát thanh toán và quản lý công nợ",
    },
    {
      code: "EMP-008",
      full_name: "Hoàng Gia Khánh",
      email: "khanh.hoang@sms.local",
      phone: "0908901234",
      title: "Người quản trị hệ thống",
      business_role: "ADMIN",
      status: "ACTIVE",
      can_accept_work: 0,
      notes: "Quản trị người dùng, phân quyền truy cập và bảo mật hệ thống",
    },
    {
      code: "EMP-009",
      full_name: "Bùi Phương Thảo",
      email: "thao.bui@sms.local",
      phone: "0909012345",
      title: "Account Executive (AE)",
      business_role: "SALES",
      status: "ON_LEAVE",
      can_accept_work: 0,
      notes: "Nghỉ phép từ 01/10/2026, hồ sơ đã điều phối và bàn giao",
    },
  ];

  for (const emp of employees) {
    const existing = db.prepare("SELECT id FROM employees WHERE code = ?").get(emp.code);
    if (!existing) {
      ins(
        `INSERT INTO employees (code, full_name, email, phone, title, business_role, status, can_accept_work, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        emp.code,
        emp.full_name,
        emp.email,
        emp.phone,
        emp.title,
        emp.business_role,
        emp.status,
        emp.can_accept_work,
        emp.notes,
      );
    }
  }

  // 2. Nhóm bán hàng (Sale Pods - FR-79, FR-81)
  const managerUser = db.prepare("SELECT id FROM users WHERE email = 'dung.pham@sms.local'").get() as { id: number } | undefined;
  const managerId = managerUser?.id ?? 1;

  const pods = [
    {
      code: "POD-SMB-NORTH",
      name: "Sale Pod SMB Miền Bắc",
      description: "Phụ trách phân khúc khách hàng vừa và nhỏ khu vực phía Bắc",
      leader_id: managerId,
      territory: "Miền Bắc",
      target_segment: "SMB",
      product_line: "Core CRM & CPQ",
    },
    {
      code: "POD-ENT-SOUTH",
      name: "Sale Pod Enterprise Miền Nam",
      description: "Phụ trách các tập đoàn và doanh nghiệp lớn tại TP.HCM và Đông Nam Bộ",
      leader_id: managerId,
      territory: "Miền Nam",
      target_segment: "ENTERPRISE",
      product_line: "Enterprise SaaS Suite & AI",
    },
  ];

  const podIdMap = new Map<string, number>();
  for (const pod of pods) {
    let row = db.prepare("SELECT id FROM teams WHERE code = ?").get(pod.code) as { id: number } | undefined;
    if (!row) {
      const pid = ins(
        `INSERT INTO teams (code, name, description, leader_id, territory, target_segment, product_line, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        pod.code,
        pod.name,
        pod.description,
        pod.leader_id,
        pod.territory,
        pod.target_segment,
        pod.product_line,
      );
      row = { id: pid };
    }
    podIdMap.set(pod.code, row.id);
  }

  // 3. Phân công thành viên nhóm (FR-80)
  const sdrUser = db.prepare("SELECT id FROM users WHERE email = 'an.nguyen@sms.local'").get() as { id: number } | undefined;
  const aeUser = db.prepare("SELECT id FROM users WHERE email = 'binh.tran@sms.local'").get() as { id: number } | undefined;

  const smbPodId = podIdMap.get("POD-SMB-NORTH");
  const entPodId = podIdMap.get("POD-ENT-SOUTH");

  if (smbPodId && managerUser && sdrUser && aeUser) {
    const mems = [
      { teamId: smbPodId, userId: managerUser.id, role: "LEADER" },
      { teamId: smbPodId, userId: sdrUser.id, role: "MEMBER" },
      { teamId: smbPodId, userId: aeUser.id, role: "MEMBER" },
    ];
    for (const m of mems) {
      const exist = db.prepare("SELECT id FROM team_members WHERE team_id = ? AND user_id = ?").get(m.teamId, m.userId);
      if (!exist) {
        ins(
          `INSERT INTO team_members (team_id, user_id, role, valid_from)
           VALUES (?, ?, ?, datetime('now', '-30 days'))`,
          m.teamId,
          m.userId,
          m.role,
        );
      }
    }
  }

  if (entPodId && managerUser && aeUser) {
    const mems = [
      { teamId: entPodId, userId: managerUser.id, role: "LEADER" },
      { teamId: entPodId, userId: aeUser.id, role: "MEMBER" },
    ];
    for (const m of mems) {
      const exist = db.prepare("SELECT id FROM team_members WHERE team_id = ? AND user_id = ?").get(m.teamId, m.userId);
      if (!exist) {
        ins(
          `INSERT INTO team_members (team_id, user_id, role, valid_from)
           VALUES (?, ?, ?, datetime('now', '-30 days'))`,
          m.teamId,
          m.userId,
          m.role,
        );
      }
    }
  }

  // 4. Thiết lập chỉ tiêu doanh số (FR-85, BR-14)
  if (aeUser && smbPodId && entPodId && managerUser) {
    const targets = [
      {
        period_type: "QUARTER",
        period_name: "2026-Q4",
        user_id: aeUser.id,
        team_id: null,
        target_amount: 500_000_000,
        target_deals: 3,
      },
      {
        period_type: "QUARTER",
        period_name: "2026-Q4",
        user_id: null,
        team_id: smbPodId,
        target_amount: 1_200_000_000,
        target_deals: 8,
      },
      {
        period_type: "QUARTER",
        period_name: "2026-Q4",
        user_id: null,
        team_id: entPodId,
        target_amount: 2_500_000_000,
        target_deals: 4,
      },
      {
        period_type: "MONTH",
        period_name: "2026-M10",
        user_id: aeUser.id,
        team_id: null,
        target_amount: 180_000_000,
        target_deals: 1,
      },
    ];

    for (const t of targets) {
      const exist = db.prepare(`
        SELECT id FROM sales_targets
        WHERE period_type = ? AND period_name = ?
          AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))
          AND (team_id = ? OR (team_id IS NULL AND ? IS NULL))
      `).get(t.period_type, t.period_name, t.user_id, t.user_id, t.team_id, t.team_id);

      if (!exist) {
        ins(
          `INSERT INTO sales_targets (period_type, period_name, user_id, team_id, target_amount, target_deals, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          t.period_type,
          t.period_name,
          t.user_id,
          t.team_id,
          t.target_amount,
          t.target_deals,
          managerUser.id,
        );
      }
    }
  }

  // 5. Cập nhật team_id cho các cơ hội mẫu hiện có
  if (smbPodId && entPodId) {
    db.prepare("UPDATE opportunities SET team_id = ? WHERE code = 'OPP-2026-001' AND team_id IS NULL").run(entPodId);
    db.prepare("UPDATE opportunities SET team_id = ? WHERE code = 'OPP-2026-002' AND team_id IS NULL").run(smbPodId);
  }
}
