import type { DatabaseSync } from "node:sqlite";

export function seedWp02(db: DatabaseSync) {
  const ins = (sql: string, ...p: (string | number | null)[]) =>
    Number(db.prepare(sql).run(...p).lastInsertRowid);

  // 1. Kiểm tra hoặc thêm các Module phần mềm (FR-24)
  const modules = [
    {
      code: "MOD-CRM",
      name: "Mô-đun Quản lý khách hàng cốt lõi (Core CRM)",
      type: "MODULE",
      category: "Core CRM",
      unit: "module",
      description: "Quản lý Lead, Account, Contact, Dòng thời gian tương tác",
      license_policy: JSON.stringify({ license_type: "NAMED_USER", min_quantity: 1, billing_cycle: "ANNUAL" }),
    },
    {
      code: "MOD-CPQ",
      name: "Mô-đun Cấu hình báo giá nâng cao (CPQ)",
      type: "MODULE",
      category: "CPQ",
      unit: "module",
      description: "Cấu hình gói, bảng giá nhiều loại tiền, phân cấp chiết khấu",
      license_policy: JSON.stringify({ license_type: "NAMED_USER", min_quantity: 5, billing_cycle: "ANNUAL" }),
    },
    {
      code: "MOD-AI",
      name: "Mô-đun Tác nhân AI (Qualification & Opportunity)",
      type: "MODULE",
      category: "AI",
      unit: "module",
      description: "AI nghiên cứu cơ hội, chấm điểm BANT tự động, tóm tắt email",
      license_policy: JSON.stringify({ license_type: "TENANT", min_quantity: 1, billing_cycle: "ANNUAL" }),
    },
    {
      code: "MOD-ERP",
      name: "Mô-đun Kết nối Kế toán ERP & Hóa đơn điện tử",
      type: "MODULE",
      category: "Integration",
      unit: "module",
      description: "Đồng bộ đơn hàng, theo dõi hóa đơn và thanh toán từ ERP",
      license_policy: JSON.stringify({ license_type: "TENANT", min_quantity: 1, billing_cycle: "ANNUAL" }),
    },
  ];

  for (const m of modules) {
    const exist = db.prepare("SELECT id FROM products WHERE code = ?").get(m.code) as { id: number } | undefined;
    if (!exist) {
      ins(
        `INSERT INTO products (code, name, type, category, unit, description, license_policy, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        m.code,
        m.name,
        m.type,
        m.category,
        m.unit,
        m.description,
        m.license_policy,
      );
    }
  }

  // 2. Thêm Gói thuê bao Enterprise (FR-25)
  const entCode = "SC-ENT";
  let entPkg = db.prepare("SELECT id FROM products WHERE code = ?").get(entCode) as { id: number } | undefined;
  if (!entPkg) {
    const pkgId = ins(
      `INSERT INTO products (code, name, type, category, unit, description, license_policy, active)
       VALUES (?, ?, 'PACKAGE', 'SaaS Suite', 'user/năm', ?, ?, 1)`,
      entCode,
      "Sales Cloud – Enterprise Edition",
      "Gói giải pháp toàn diện cho tập đoàn lớn: Core CRM, CPQ, Tác nhân AI và Tích hợp ERP",
      JSON.stringify({ license_type: "NAMED_USER", min_quantity: 20, billing_cycle: "ANNUAL" }),
    );
    entPkg = { id: pkgId };
  }

  // 3. Liên kết thành phần cho gói (FR-25, product_components)
  const modCrm = db.prepare("SELECT id FROM products WHERE code = 'MOD-CRM'").get() as { id: number } | undefined;
  const modCpq = db.prepare("SELECT id FROM products WHERE code = 'MOD-CPQ'").get() as { id: number } | undefined;
  const modAi = db.prepare("SELECT id FROM products WHERE code = 'MOD-AI'").get() as { id: number } | undefined;
  const modErp = db.prepare("SELECT id FROM products WHERE code = 'MOD-ERP'").get() as { id: number } | undefined;

  if (entPkg && modCrm && modCpq && modAi && modErp) {
    const comps = [
      { compId: modCrm.id, qty: 1, opt: 0 },
      { compId: modCpq.id, qty: 1, opt: 0 },
      { compId: modAi.id, qty: 1, opt: 0 },
      { compId: modErp.id, qty: 1, opt: 1 }, // Tùy chọn
    ];
    for (const c of comps) {
      db.prepare(`
        INSERT OR IGNORE INTO product_components (package_id, component_id, quantity, is_optional)
        VALUES (?, ?, ?, ?)
      `).run(entPkg.id, c.compId, c.qty, c.opt);
    }
  }

  // 4. Bổ sung Bảng giá Doanh nghiệp lớn (Enterprise) (BR-03, BR-22, FR-28)
  const entPlName = "Bảng giá Doanh nghiệp lớn (Enterprise)";
  let entPl = db.prepare("SELECT id FROM price_lists WHERE name = ?").get(entPlName) as { id: number } | undefined;
  if (!entPl) {
    const plId = ins(
      `INSERT INTO price_lists (name, currency, customer_segment, valid_from, valid_to, is_default, description, active)
       VALUES (?, 'VND', 'ENTERPRISE', datetime('now', '-30 days'), datetime('now', '+335 days'), 0, ?, 1)`,
      entPlName,
      "Áp dụng cho doanh nghiệp từ 200 nhân sự trở lên theo quy tắc BR-03",
    );
    entPl = { id: plId };

    // Đơn giá cho Bảng giá Enterprise
    const allProds = db.prepare("SELECT id, code, type FROM products").all() as { id: number; code: string; type: string }[];
    for (const p of allProds) {
      let price = 5_000_000;
      let tax = 10;
      if (p.code === "SC-STD") price = 3_200_000;
      else if (p.code === "SC-PRO") price = 5_500_000;
      else if (p.code === "SC-ENT") price = 9_600_000;
      else if (p.code === "SC-AI") price = 2_000_000;
      else if (p.code === "MOD-CRM") price = 2_000_000;
      else if (p.code === "MOD-CPQ") price = 2_500_000;
      else if (p.code === "MOD-AI") price = 2_000_000;
      else if (p.code === "MOD-ERP") price = 3_000_000;
      else if (p.type === "SERVICE") { price = 4_500_000; tax = 0; } // Dịch vụ phần mềm thuế 0%
      else if (p.type === "TRAINING") { price = 7_000_000; tax = 10; }

      db.prepare(`
        INSERT OR IGNORE INTO price_list_items (price_list_id, product_id, unit_price, tax_pct)
        VALUES (?, ?, ?, ?)
      `).run(entPl.id, p.id, price, tax);
    }
  }

  // Cập nhật bảng giá chuẩn mặc định thành SMB nếu chưa có segment
  db.prepare(`
    UPDATE price_lists SET customer_segment = 'SMB', is_default = 1, valid_from = datetime('now', '-30 days')
    WHERE name = 'Bảng giá chuẩn 2026' AND customer_segment = 'ALL'
  `).run();
}
