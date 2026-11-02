import type { DatabaseSync } from "node:sqlite";
import { SETTING_DEFAULTS } from "@/lib/settings-defaults";
import { hashPassword } from "@/lib/password";
import { fixUserRoleCheckConstraint } from "../migrations/wp00_001_shared_schema";

export function seedWp00(db: DatabaseSync) {
  fixUserRoleCheckConstraint(db);
  const defaultPasswordHash = hashPassword("Password123!");

  const insUser = (
    employeeId: string,
    name: string,
    email: string,
    role: string,
    title: string,
  ) => {
    db.prepare(`
      INSERT INTO users (employee_id, name, email, password_hash, role, title, status, active)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1)
      ON CONFLICT(email) DO UPDATE SET
        employee_id = excluded.employee_id,
        password_hash = excluded.password_hash,
        role = excluded.role,
        title = excluded.title;
    `).run(employeeId, name, email, defaultPasswordHash, role, title);
  };

  // Demo accounts cho từng vai trò theo ROLES.md
  insUser("EMP-001", "Nguyễn Văn An", "an.nguyen@sms.local", "SALES", "SDR (Sales Development Rep)");
  insUser("EMP-002", "Trần Thị Bình", "binh.tran@sms.local", "SALES", "Account Executive (AE)");
  insUser("EMP-003", "Lê Minh Châu", "chau.le@sms.local", "PRESALES", "Chuyên viên tư vấn giải pháp (SE)");
  insUser("EMP-005", "Phạm Quốc Dũng", "dung.pham@sms.local", "SALES_MANAGER", "Quản lý kinh doanh");
  insUser("EMP-006", "Võ Thu Hà", "ha.vo@sms.local", "FINANCE", "Nhân viên Tài chính – Kế toán");
  insUser("EMP-008", "Hoàng Gia Khánh", "khanh.hoang@sms.local", "ADMIN", "Người quản trị hệ thống");

  // Nạp toàn bộ thiết lập mặc định (BUSINESS-RULES.md)
  for (const [key, item] of Object.entries(SETTING_DEFAULTS)) {
    db.prepare(`
      INSERT INTO settings (key, value, description)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        description = excluded.description;
    `).run(key, item.value, item.description);
  }
}
