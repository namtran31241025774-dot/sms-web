import type { DatabaseSync } from "node:sqlite";
import { seedWp00 } from "./wp00";
import { seedWp01 } from "./wp01";
import { seedWp02 } from "./wp02";
import { seedWp07 } from "./wp07";
import { seedWp09 } from "./wp09";
import { seedWp03 } from "./wp03";
import {seedTanCang} from './rebuild-tan-cang';
import {backfillAssignedTeams} from './rebuild-team-backfill';

/**
 * Điều phối toàn bộ dữ liệu mẫu (seeds) của các gói việc.
 * WP-00 gọi tất cả; các WP sau chỉ thêm hàm seed của mình vào đây.
 */
export function runAllSeeds(db: DatabaseSync) {
  // 1. Seed nền tảng và người dùng demo (WP-00)
  seedWp00(db);

  // 2. Seed Quản lý khách hàng (WP-01)
  seedWp01(db);

  // 3. Seed Danh mục sản phẩm & Bảng giá (WP-02)
  seedWp02(db);

  // 4. Seed Đội ngũ Sales & Phân công & Chỉ tiêu (WP-07)
  seedWp07(db);

  // 5. Seed Quản trị hệ thống & Phân quyền (WP-09)
  seedWp09(db);

  // 6. Seed Đánh giá khách hàng & Phát triển cơ hội (WP-03)
  seedWp03(db);
  seedTanCang(db);
  backfillAssignedTeams(db);
}
