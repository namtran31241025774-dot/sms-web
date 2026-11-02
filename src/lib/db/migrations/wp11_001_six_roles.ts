import type { Migration } from "./types";

// Bài chốt 6 vai trò: bỏ Quản lý tư vấn giải pháp, Người quản lý tác nhân AI, Pháp chế (DEC-30).
// Tài khoản cũ được khóa chứ không xóa, để giữ liên kết lịch sử và nhật ký.
export const wp11_001_six_roles: Migration = {
  name: "wp11_001_six_roles",
  up(db) {
    db.exec(`
      UPDATE users SET active = 0, status = 'INACTIVE' WHERE role IN ('PRESALES_MANAGER','AI_MANAGER','LEGAL');
      UPDATE users SET role = 'PRESALES' WHERE role = 'PRESALES_MANAGER';
      UPDATE users SET role = 'ADMIN' WHERE role = 'AI_MANAGER';
      UPDATE users SET role = 'SALES' WHERE role = 'LEGAL';
      UPDATE users SET title = 'Chuyên viên tư vấn giải pháp (SE)' WHERE title LIKE '%tư vấn kỹ thuật%';
      UPDATE users SET title = 'Nhân viên triển khai kỹ thuật' WHERE role = 'DELIVERY';
      UPDATE employees SET business_role = 'PRESALES' WHERE business_role = 'PRESALES_MANAGER';
      UPDATE employees SET business_role = 'ADMIN' WHERE business_role = 'AI_MANAGER';
    `);
  },
};
