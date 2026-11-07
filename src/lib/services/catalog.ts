// Dịch vụ quản lý Sản phẩm, Dịch vụ, Mô-đun và Gói SaaS (FR-21 → FR-26).
import { all, get, run, tx } from "../db";
import { assert } from "../domain";
import { audit, type Actor } from "./core";

export type ProductType = "SUBSCRIPTION" | "SERVICE" | "TRAINING" | "MODULE" | "PACKAGE";

export type LicensePolicy = {
  license_type: "NAMED_USER" | "TENANT" | "CONCURRENT";
  min_quantity?: number;
  max_quantity?: number;
  billing_cycle?: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  term_months?: number;
  terms_note?: string;
};

export type Product = {
  id: number;
  code: string;
  name: string;
  type: ProductType;
  category: string | null;
  unit: string;
  description: string | null;
  license_policy: string | null;
  active: number;
};

export type ProductComponent = {
  id: number;
  package_id: number;
  component_id: number;
  component_code: string;
  component_name: string;
  component_type: ProductType;
  quantity: number;
  is_optional: number;
  created_at: string;
};

export type ProductInput = {
  code: string;
  name: string;
  type: ProductType;
  category?: string | null;
  unit: string;
  description?: string | null;
  license_policy?: LicensePolicy | string | null;
};

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  SUBSCRIPTION: "Thuê bao phần mềm",
  SERVICE: "Dịch vụ triển khai",
  TRAINING: "Dịch vụ đào tạo",
  MODULE: "Mô-đun tính năng",
  PACKAGE: "Gói giải pháp (Package)",
};

/**
 * FR-23: Tra cứu sản phẩm, dịch vụ và chính sách.
 */
export function listProducts(filter: {
  type?: string;
  category?: string;
  active?: number | boolean;
  q?: string;
} = {}): Product[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.type) {
    where.push("p.type = ?");
    params.push(filter.type);
  }
  if (filter.category) {
    where.push("p.category = ?");
    params.push(filter.category);
  }
  if (filter.active !== undefined) {
    where.push("p.active = ?");
    params.push(typeof filter.active === "boolean" ? (filter.active ? 1 : 0) : filter.active);
  }
  if (filter.q) {
    where.push("(p.code LIKE ? OR p.name LIKE ? OR p.description LIKE ?)");
    params.push(`%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return all<Product>(
    `SELECT p.* FROM products p ${clause} ORDER BY p.active DESC, p.type, p.code`,
    ...params,
  );
}

export function getProduct(id: number): Product | undefined {
  return get<Product>("SELECT * FROM products WHERE id = ?", id);
}

export function getProductByCode(code: string): Product | undefined {
  return get<Product>("SELECT * FROM products WHERE code = ?", code.trim().toUpperCase());
}

/**
 * FR-21, FR-24, FR-25: Tạo sản phẩm, dịch vụ, mô-đun hoặc gói giải pháp mới.
 * Kiểm tra trùng lặp mã sản phẩm (code).
 */
export function createProduct(actor: Actor, input: ProductInput): number {
  assert(input.code?.trim(), "Mã sản phẩm không được để trống");
  assert(input.name?.trim(), "Tên sản phẩm không được để trống");
  assert(input.unit?.trim(), "Đơn vị tính không được để trống");

  const code = input.code.trim().toUpperCase();
  const dup = get("SELECT id FROM products WHERE code = ?", code);
  assert(!dup, `Mã sản phẩm ${code} đã tồn tại trong danh mục`);

  const licensePolicyStr =
    typeof input.license_policy === "object" && input.license_policy !== null
      ? JSON.stringify(input.license_policy)
      : (input.license_policy?.trim() || null);

  return tx(() => {
    const { id } = run(
      `INSERT INTO products (code, name, type, category, unit, description, license_policy, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      code,
      input.name.trim(),
      input.type,
      input.category?.trim() || null,
      input.unit.trim(),
      input.description?.trim() || null,
      licensePolicyStr,
    );

    audit(actor, "product", id, "CREATE", {
      details: { code, name: input.name, type: input.type },
    });

    return id;
  });
}

/**
 * Cập nhật thông tin và chính sách sử dụng (FR-21, FR-26).
 * Cập nhật danh mục không làm thay đổi các báo giá hoặc đơn hàng đã tạo trước đó.
 */
export function updateProduct(actor: Actor, id: number, input: Partial<ProductInput>) {
  const current = getProduct(id);
  assert(current, "Không tìm thấy sản phẩm");

  const updates: Record<string, string | number | null> = {};

  if ("name" in input && input.name) updates.name = input.name.trim();
  if ("type" in input && input.type) updates.type = input.type;
  if ("category" in input) updates.category = input.category?.trim() || null;
  if ("unit" in input && input.unit) updates.unit = input.unit.trim();
  if ("description" in input) updates.description = input.description?.trim() || null;
  if ("license_policy" in input) {
    updates.license_policy =
      typeof input.license_policy === "object" && input.license_policy !== null
        ? JSON.stringify(input.license_policy)
        : (input.license_policy?.trim() || null);
  }

  const keys = Object.keys(updates);
  if (!keys.length) return;

  tx(() => {
    run(
      `UPDATE products SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      ...keys.map((k) => updates[k]),
      id,
    );

    audit(actor, "product", id, "UPDATE", { details: keys });
  });
}

/**
 * FR-22: Ngừng kinh doanh sản phẩm hoặc dịch vụ (Soft disable).
 * Chuyển active = 0 để không chọn cho giao dịch mới; giữ thông tin trên các báo giá và đơn hàng đã có.
 */
export function deactivateProduct(actor: Actor, id: number) {
  const current = getProduct(id);
  assert(current, "Không tìm thấy sản phẩm");
  assert(current.active === 1, "Sản phẩm đã ở trạng thái ngừng kinh doanh");

  tx(() => {
    run("UPDATE products SET active = 0 WHERE id = ?", id);
    audit(actor, "product", id, "DEACTIVATE", { from: "1", to: "0" });
  });
}

/**
 * Kích hoạt lại sản phẩm để tiếp tục kinh doanh (FR-22).
 */
export function activateProduct(actor: Actor, id: number) {
  const current = getProduct(id);
  assert(current, "Không tìm thấy sản phẩm");
  assert(current.active === 0, "Sản phẩm đang được kinh doanh");

  tx(() => {
    run("UPDATE products SET active = 1 WHERE id = ?", id);
    audit(actor, "product", id, "ACTIVATE", { from: "0", to: "1" });
  });
}

/**
 * FR-25: Lấy danh sách thành phần của một Gói giải pháp (Package).
 */
export function getPackageComponents(packageId: number): ProductComponent[] {
  return all<ProductComponent>(
    `SELECT pc.*, p.code AS component_code, p.name AS component_name, p.type AS component_type
     FROM product_components pc
     JOIN products p ON p.id = pc.component_id
     WHERE pc.package_id = ?
     ORDER BY pc.is_optional, p.name`,
    packageId,
  );
}

/**
 * FR-25: Thêm thành phần vào gói giải pháp (ngăn chu trình và tự chứa).
 */
export function addPackageComponent(
  actor: Actor,
  packageId: number,
  componentId: number,
  quantity = 1,
  isOptional = false,
): number {
  assert(packageId !== componentId, "Gói không thể chứa chính nó");

  const pkg = getProduct(packageId);
  const comp = getProduct(componentId);
  assert(pkg, "Không tìm thấy gói sản phẩm");
  assert(comp, "Không tìm thấy thành phần cần thêm");
  assert(pkg.type === "PACKAGE", "Chỉ có thể thêm thành phần vào sản phẩm loại Gói giải pháp (PACKAGE)");

  // Kiểm tra chu trình: thành phần không được là một gói đang chứa ngược lại packageId
  const reverse = get(
    "SELECT id FROM product_components WHERE package_id = ? AND component_id = ?",
    componentId,
    packageId,
  );
  assert(!reverse, "Không thể thêm vì tạo vòng lặp phụ thuộc gói");

  return tx(() => {
    const { id } = run(
      `INSERT INTO product_components (package_id, component_id, quantity, is_optional)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(package_id, component_id) DO UPDATE SET
         quantity = excluded.quantity,
         is_optional = excluded.is_optional`,
      packageId,
      componentId,
      Math.max(1, quantity),
      isOptional ? 1 : 0,
    );

    audit(actor, "product", packageId, "COMPONENT_ADD", {
      details: { componentId, quantity, isOptional },
    });

    return id;
  });
}

/**
 * FR-25: Gỡ bỏ thành phần khỏi gói giải pháp.
 */
export function removePackageComponent(actor: Actor, packageId: number, componentId: number) {
  tx(() => {
    run(
      "DELETE FROM product_components WHERE package_id = ? AND component_id = ?",
      packageId,
      componentId,
    );
    audit(actor, "product", packageId, "COMPONENT_REMOVE", { details: { componentId } });
  });
}

/**
 * Lấy danh mục các nhóm sản phẩm hiện có.
 */
export function listCategories(): string[] {
  const rows = all<{ category: string }>(
    "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category",
  );
  return rows.map((r) => r.category);
}
