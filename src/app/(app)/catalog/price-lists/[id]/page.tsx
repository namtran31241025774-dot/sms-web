import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatVnd } from "@/lib/domain";
import { listProducts, type ProductType } from "@/lib/services/catalog";
import {
  getPriceList,
  getPriceListItems,
} from "@/lib/services/pricing";
import { SubmitButton } from "@/components/client";
import { ProductStatusBadge, ProductTypeBadge } from "@/components/catalog/product-badge";
import { CustomerSegmentBadge } from "@/components/catalog/segment-badge";
import {
  Card,
  CommandBar,
  CommandLink,
  Flash,
  FormField,
  Grid,
  PageTitle,
} from "@/components/ui";
import {
  activatePriceListAction,
  deactivatePriceListAction,
  removePriceListItemAction,
  setPriceListItemAction,
  updatePriceListAction,
} from "../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await params;
  const pl = getPriceList(Number(p.id));
  return { title: pl ? `${pl.name} · Bảng giá` : "Chi tiết bảng giá" };
}

export default async function PriceListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const p = await params;
  const sp = await searchParams;
  const priceListId = Number(p.id);
  const priceList = getPriceList(priceListId);

  if (!priceList) notFound();

  const canWrite = can(user.role, "pricelist.write");
  const items = getPriceListItems(priceListId);
  const allProducts = listProducts({ active: 1 });

  return (
    <>
      <CommandBar>
        {canWrite && (
          <button type="submit" form="update-pricelist" className="cmd">
            Lưu thay đổi
          </button>
        )}
        <CommandLink href="/catalog?tab=price_lists" icon="arrowLeft">
          Quay lại danh sách
        </CommandLink>
        {canWrite && priceList.is_default === 0 && (
          <>
            {priceList.active === 1 ? (
              <form action={deactivatePriceListAction} className="inline">
                <input type="hidden" name="id" value={priceList.id} />
                <button type="submit" className="cmd text-rose-600 hover:bg-rose-50">
                  Ngừng áp dụng
                </button>
              </form>
            ) : (
              <form action={activatePriceListAction} className="inline">
                <input type="hidden" name="id" value={priceList.id} />
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
        title={priceList.name}
        subtitle={`Loại tiền: ${priceList.currency} · Phân khúc: ${priceList.customer_segment}`}
        icon="money"
        right={
          <div className="flex items-center gap-2">
            <CustomerSegmentBadge segment={priceList.customer_segment} />
            <ProductStatusBadge active={priceList.active} />
          </div>
        }
      />

      <div className="grid max-w-5xl gap-6 px-6 pb-12">
        {/* Thông tin bảng giá */}
        <form id="update-pricelist" action={updatePriceListAction} className="grid gap-4">
          <input type="hidden" name="id" value={priceList.id} />

          <Card title="Cấu hình bảng giá">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Tên bảng giá" required className="md:col-span-2">
                <input
                  name="name"
                  defaultValue={priceList.name}
                  disabled={!canWrite}
                  required
                  className="input"
                />
              </FormField>

              <FormField label="Phân khúc áp dụng" required>
                <select
                  name="customer_segment"
                  defaultValue={priceList.customer_segment}
                  disabled={!canWrite}
                  required
                  className="select"
                >
                  <option value="ALL">Áp dụng toàn bộ (ALL)</option>
                  <option value="SMB">Doanh nghiệp vừa và nhỏ (SMB &lt; 200 nhân sự)</option>
                  <option value="ENTERPRISE">Doanh nghiệp lớn (Enterprise ≥ 200 nhân sự)</option>
                </select>
              </FormField>

              <FormField label="Loại tiền tệ" required>
                <input
                  name="currency"
                  defaultValue={priceList.currency}
                  disabled={!canWrite}
                  required
                  className="input font-mono uppercase"
                />
              </FormField>

              <FormField label="Ngày bắt đầu hiệu lực">
                <input
                  name="valid_from"
                  type="date"
                  defaultValue={priceList.valid_from ? priceList.valid_from.slice(0, 10) : ""}
                  disabled={!canWrite}
                  className="input"
                />
              </FormField>

              <FormField label="Ngày kết thúc hiệu lực">
                <input
                  name="valid_to"
                  type="date"
                  defaultValue={priceList.valid_to ? priceList.valid_to.slice(0, 10) : ""}
                  disabled={!canWrite}
                  className="input"
                />
              </FormField>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_default"
                    defaultChecked={priceList.is_default === 1}
                    disabled={!canWrite}
                    className="accent-[var(--brand)]"
                  />
                  Đặt làm bảng giá mặc định cho phân khúc này
                </label>
              </div>

              <FormField label="Mô tả / Ghi chú" className="md:col-span-2">
                <textarea
                  name="description"
                  defaultValue={priceList.description || ""}
                  disabled={!canWrite}
                  className="textarea"
                  rows={2}
                />
              </FormField>
            </div>

            {canWrite && (
              <div className="mt-3 flex gap-2">
                <SubmitButton variant="primary" icon="save">
                  Cập nhật thông tin bảng giá
                </SubmitButton>
              </div>
            )}
          </Card>
        </form>

        {/* Danh mục sản phẩm & Đơn giá trong bảng giá */}
        <Card
          title="Đơn giá và Thuế suất từng mặt hàng"
          actions={<span className="text-xs text-ink-3">{items.length} mục giá</span>}
        >
          <p className="mb-4 text-xs text-ink-2">
            Mỗi mặt hàng trong bảng giá có đơn giá riêng và thuế suất GTGT (mặc định 10%, đối với dịch vụ phần mềm hoặc chuyển giao công nghệ là 0%).
            Giá đã khóa trên Đơn hàng hoặc Báo giá đã duyệt không tự động thay đổi khi sửa bảng giá.
          </p>

          <Grid>
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm / Dịch vụ</th>
                <th>Loại</th>
                <th>Đơn vị tính</th>
                <th>Đơn giá ({priceList.currency})</th>
                <th>Thuế GTGT</th>
                {canWrite && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono font-medium">{item.product_code}</td>
                  <td>
                    <Link className="link" href={`/catalog/products/${item.product_id}`}>
                      {item.product_name}
                    </Link>
                  </td>
                  <td>
                    <ProductTypeBadge type={item.product_type as ProductType} />
                  </td>
                  <td>{item.unit}</td>
                  <td className="font-semibold">
                    {formatVnd(item.unit_price)} {priceList.currency !== "VND" ? priceList.currency : ""}
                  </td>
                  <td>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${item.tax_pct === 0 ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-800"}`}>
                      {item.tax_pct}%
                    </span>
                  </td>
                  {canWrite && (
                    <td>
                      <form action={removePriceListItemAction} className="inline">
                        <input type="hidden" name="id" value={priceList.id} />
                        <input type="hidden" name="product_id" value={item.product_id} />
                        <button
                          type="submit"
                          className="text-xs text-rose-600 hover:underline"
                          title="Gỡ khỏi bảng giá"
                        >
                          Xóa giá
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Grid>

          {/* Form thêm hoặc cập nhật đơn giá cho sản phẩm */}
          {canWrite && (
            <div className="mt-6 border-t border-[#f0f0f0] pt-4">
              <h4 className="text-sm font-semibold text-ink-1 mb-3">
                Thêm hoặc điều chỉnh đơn giá mặt hàng:
              </h4>

              <form action={setPriceListItemAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={priceList.id} />

                <FormField label="Chọn sản phẩm / dịch vụ" className="w-72">
                  <select name="product_id" required className="select !h-8 text-xs !py-0">
                    <option value="" disabled selected>
                      Chọn sản phẩm...
                    </option>
                    {allProducts.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.code} – {prod.name} ({prod.unit})
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label={`Đơn giá (${priceList.currency})`} className="w-36">
                  <input
                    name="unit_price"
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="0"
                    required
                    className="input !h-8 text-xs font-semibold"
                  />
                </FormField>

                <FormField label="Thuế GTGT (%)" className="w-24">
                  <input
                    name="tax_pct"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="10"
                    required
                    className="input !h-8 text-xs"
                  />
                </FormField>

                <div className="pb-1">
                  <SubmitButton size="sm" variant="primary" icon="save">
                    Lưu đơn giá
                  </SubmitButton>
                </div>
              </form>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
