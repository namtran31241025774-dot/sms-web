import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatVnd } from "@/lib/domain";
import { all } from "@/lib/db";
import {
  getProduct,
  getPackageComponents,
  listCategories,
  listProducts,
} from "@/lib/services/catalog";
import { SubmitButton } from "@/components/client";
import { ProductStatusBadge, ProductTypeBadge } from "@/components/catalog/product-badge";
import {
  Card,
  CommandBar,
  CommandLink,
  Flash,
  FormField,
  Grid,
  MessageBar,
  PageTitle,
} from "@/components/ui";
import {
  activateProductAction,
  addPackageComponentAction,
  deactivateProductAction,
  removePackageComponentAction,
  updateProductAction,
} from "../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await params;
  const prod = getProduct(Number(p.id));
  return { title: prod ? `${prod.code} · ${prod.name}` : "Chi tiết sản phẩm" };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const p = await params;
  const sp = await searchParams;
  const productId = Number(p.id);
  const product = getProduct(productId);

  if (!product) notFound();

  const canWrite = can(user.role, "catalog.write");
  const categories = listCategories();

  // If PACKAGE, get components
  const isPackage = product.type === "PACKAGE";
  const components = isPackage ? getPackageComponents(productId) : [];
  const candidateComponents = isPackage
    ? listProducts({ active: 1 }).filter((cp) => cp.id !== productId && cp.type !== "PACKAGE")
    : [];

  // Get price lists containing this product
  const priceListRows = all<{
    price_list_id: number;
    price_list_name: string;
    currency: string;
    unit_price: number;
    tax_pct: number;
  }>(
    `SELECT pli.price_list_id, pl.name AS price_list_name, pl.currency, pli.unit_price, pli.tax_pct
     FROM price_list_items pli
     JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pli.product_id = ?
     ORDER BY pl.name`,
    productId,
  );

  return (
    <>
      <CommandBar>
        {canWrite && (
          <button type="submit" form="update-product" className="cmd">
            Lưu thay đổi
          </button>
        )}
        <CommandLink href="/catalog" icon="arrowLeft">
          Quay lại danh mục
        </CommandLink>
        {canWrite && (
          <>
            {product.active === 1 ? (
              <form action={deactivateProductAction} className="inline">
                <input type="hidden" name="id" value={product.id} />
                <button type="submit" className="cmd text-rose-600 hover:bg-rose-50">
                  Ngừng kinh doanh
                </button>
              </form>
            ) : (
              <form action={activateProductAction} className="inline">
                <input type="hidden" name="id" value={product.id} />
                <button type="submit" className="cmd text-emerald-600 hover:bg-emerald-50">
                  Kích hoạt lại
                </button>
              </form>
            )}
          </>
        )}
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle
        title={`${product.code} – ${product.name}`}
        subtitle={`Loại: ${product.type} · Đơn vị: ${product.unit}`}
        icon="product"
        right={
          <div className="flex items-center gap-2">
            <ProductTypeBadge type={product.type} />
            <ProductStatusBadge active={product.active} />
          </div>
        }
      />

      <div className="grid max-w-5xl gap-6 px-6 pb-12">
        {product.active === 0 && (
          <MessageBar intent="warning">
            Sản phẩm này đang ở trạng thái <strong>Ngừng kinh doanh</strong>. Sản phẩm sẽ không hiển thị khi lập các báo giá hoặc cơ hội mới, nhưng toàn bộ dữ liệu lịch sử trên báo giá và đơn hàng trước đây được bảo toàn nguyên vẹn.
          </MessageBar>
        )}

        {/* Thông tin sản phẩm */}
        <form id="update-product" action={updateProductAction} className="grid gap-4">
          <input type="hidden" name="id" value={product.id} />

          <Card title="Thông tin sản phẩm và Dịch vụ">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Mã sản phẩm (Code)" hint="Mã định danh không thể thay đổi">
                <input disabled value={product.code} className="input uppercase font-mono bg-gray-50" />
              </FormField>

              <FormField label="Loại sản phẩm">
                <select
                  name="type"
                  disabled={!canWrite}
                  defaultValue={product.type}
                  className="select"
                >
                  <option value="PACKAGE">Gói giải pháp (Package)</option>
                  <option value="SUBSCRIPTION">Thuê bao phần mềm (Subscription)</option>
                  <option value="MODULE">Mô-đun tính năng (Module)</option>
                  <option value="SERVICE">Dịch vụ triển khai (Service)</option>
                  <option value="TRAINING">Dịch vụ đào tạo (Training)</option>
                </select>
              </FormField>

              <FormField label="Tên sản phẩm / Dịch vụ" required className="md:col-span-2">
                <input
                  name="name"
                  defaultValue={product.name}
                  disabled={!canWrite}
                  required
                  className="input"
                />
              </FormField>

              <FormField label="Nhóm danh mục">
                <input
                  name="category"
                  defaultValue={product.category || ""}
                  disabled={!canWrite}
                  className="input"
                  list="cat-list"
                />
                <datalist id="cat-list">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </FormField>

              <FormField label="Đơn vị tính" required>
                <input
                  name="unit"
                  defaultValue={product.unit}
                  disabled={!canWrite}
                  required
                  className="input"
                />
              </FormField>

              <FormField label="Mô tả tóm tắt" className="md:col-span-2">
                <textarea
                  name="description"
                  defaultValue={product.description || ""}
                  disabled={!canWrite}
                  className="textarea"
                  rows={3}
                />
              </FormField>
            </div>
          </Card>

          <Card title="Chính sách quyền sử dụng (License Policy ·)">
            <FormField label="Cấu hình chính sách bản quyền (JSON hoặc diễn giải)">
              <textarea
                name="license_policy"
                defaultValue={product.license_policy || ""}
                disabled={!canWrite}
                className="textarea font-mono text-xs"
                rows={4}
              />
            </FormField>
            {canWrite && (
              <div className="mt-3 flex gap-2">
                <SubmitButton variant="primary" icon="save">
                  Cập nhật thông tin sản phẩm
                </SubmitButton>
              </div>
            )}
          </Card>
        </form>

        {/* NẾU LÀ GÓI GIẢI PHÁP (PACKAGE): HIỂN THỊ THÀNH PHẦN (FR-25) */}
        {isPackage && (
          <Card
            title="Thành phần của gói giải pháp (Package Components ·)"
            actions={<span className="text-xs text-ink-3">{components.length} thành phần</span>}
          >
            <p className="mb-4 text-xs text-ink-2">
              Gói giải pháp tập hợp các mô-đun phần mềm và dịch vụ kèm theo. Cấu hình này là danh mục dùng chung để tự động điền vào báo giá và kiểm tra cấu hình giải pháp.
            </p>

            <Grid>
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên thành phần</th>
                  <th>Loại</th>
                  <th>Số lượng mặc định</th>
                  <th>Tính chất</th>
                  {canWrite && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {components.map((comp) => (
                  <tr key={comp.id}>
                    <td className="font-mono font-medium">{comp.component_code}</td>
                    <td>
                      <Link className="link" href={`/catalog/products/${comp.component_id}`}>
                        {comp.component_name}
                      </Link>
                    </td>
                    <td>
                      <ProductTypeBadge type={comp.component_type} />
                    </td>
                    <td>{comp.quantity}</td>
                    <td>
                      {comp.is_optional ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          Tùy chọn (Optional)
                        </span>
                      ) : (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 font-medium">
                          Bắt buộc (Required)
                        </span>
                      )}
                    </td>
                    {canWrite && (
                      <td>
                        <form action={removePackageComponentAction} className="inline">
                          <input type="hidden" name="id" value={product.id} />
                          <input type="hidden" name="component_id" value={comp.component_id} />
                          <button
                            type="submit"
                            className="text-xs text-rose-600 hover:underline"
                            title="Gỡ khỏi gói"
                          >
                            Gỡ bỏ
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Grid>

            {/* Form thêm thành phần mới vào gói */}
            {canWrite && candidateComponents.length > 0 && (
              <form
                action={addPackageComponentAction}
                className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#f0f0f0] pt-4"
              >
                <input type="hidden" name="id" value={product.id} />
                <FormField label="Thêm thành phần vào gói" className="w-64">
                  <select name="component_id" required className="select !h-8 text-xs !py-0">
                    <option value="" disabled selected>
                      Chọn mô-đun hoặc dịch vụ...
                    </option>
                    {candidateComponents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} – {c.name} ({c.type})
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Số lượng" className="w-24">
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                    required
                    className="input !h-8 text-xs"
                  />
                </FormField>

                <div className="pb-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" name="is_optional" className="accent-[var(--brand)]" />
                    Thành phần tùy chọn
                  </label>
                </div>

                <div className="pb-1">
                  <SubmitButton size="sm" variant="secondary" icon="add">
                    Thêm vào gói
                  </SubmitButton>
                </div>
              </form>
            )}
          </Card>
        )}

        {/* Đơn giá trong các bảng giá */}
        <Card title="Đơn giá hiện hành trong các Bảng giá">
          {priceListRows.length > 0 ? (
            <Grid>
              <thead>
                <tr>
                  <th>Bảng giá</th>
                  <th>Đơn giá</th>
                  <th>Thuế GTGT</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {priceListRows.map((row) => (
                  <tr key={row.price_list_id}>
                    <td className="font-medium">
                      <Link className="link" href={`/catalog/price-lists/${row.price_list_id}`}>
                        {row.price_list_name}
                      </Link>
                    </td>
                    <td className="font-medium">
                      {formatVnd(row.unit_price)} {row.currency !== "VND" ? row.currency : ""}
                    </td>
                    <td>{row.tax_pct}%</td>
                    <td>
                      <Link
                        className="text-xs text-[var(--brand)] hover:underline"
                        href={`/catalog/price-lists/${row.price_list_id}`}
                      >
                        Sửa giá trong bảng
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Grid>
          ) : (
            <div className="text-xs text-ink-3 py-2">
              Sản phẩm này chưa được gán đơn giá trong bảng giá nào. Vui lòng mở trang Bảng giá để thiết lập đơn giá.
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
