import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/domain";
import { settingNumber } from "@/lib/services/core";
import { listCategories, listProducts } from "@/lib/services/catalog";
import { listPriceLists } from "@/lib/services/pricing";
import { SubmitButton } from "@/components/client";
import { ProductStatusBadge, ProductTypeBadge } from "@/components/catalog/product-badge";
import { CustomerSegmentBadge } from "@/components/catalog/segment-badge";
import {
  Card,
  CommandBar,
  CommandLink,
  Empty,
  Flash,
  FormField,
  Grid,
  MessageBar,
  PageTitle,
  Tabs,
} from "@/components/ui";
import { updateDiscountPolicyAction } from "./actions";

export const metadata: Metadata = { title: "Danh mục sản phẩm và Bảng giá" };

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    type?: string;
    category?: string;
    q?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab || "products";

  const canWriteCatalog = can(user.role, "catalog.write");
  const canWritePriceList = can(user.role, "pricelist.write");
  const canWriteDiscount = can(user.role, "discount.policy.write");

  // Data
  const products = listProducts({ type: sp.type, category: sp.category, q: sp.q });
  const priceLists = listPriceLists();
  const categories = listCategories();

  // Settings for discount policy
  const discountThreshold = settingNumber("discount_threshold_pct") || 10;
  const discountMax = settingNumber("discount_max_pct") || 30;

  return (
    <>
      <CommandBar>
        {canWriteCatalog && (
          <CommandLink href="/catalog/products/new" icon="add">
            Thêm sản phẩm / dịch vụ
          </CommandLink>
        )}
        {canWritePriceList && (
          <CommandLink href="/catalog/price-lists/new" icon="money">
            Tạo bảng giá mới
          </CommandLink>
        )}
        <CommandLink href="/catalog" icon="refresh">
          Làm mới
        </CommandLink>
      </CommandBar>
      <Flash sp={sp} />

      <PageTitle
        title="Sản phẩm, Dịch vụ và Bảng giá"
        subtitle="Quản lý danh mục gói SaaS, mô-đun, bảng giá theo phân khúc và hạn mức duyệt chiết khấu"
        icon="product"
      />

      <Tabs
        base="/catalog"
        current={tab}
        tabs={[
          { key: "products", label: "Sản phẩm và Dịch vụ", count: products.length },
          { key: "price_lists", label: "Bảng giá và Phân khúc", count: priceLists.length },
          { key: "discounts", label: "Chính sách chiết khấu" },
        ]}
      />

      <div className="px-6 py-4 pb-10">
        {/* TAB 1: SẢN PHẨM & DỊCH VỤ */}
        {tab === "products" && (
          <div className="space-y-4">
            {/* Thanh tìm kiếm & lọc */}
            <div className="flex flex-wrap items-center gap-3">
              <form method="GET" action="/catalog" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="tab" value="products" />
                <input
                  name="q"
                  defaultValue={sp.q || ""}
                  placeholder="Tìm theo mã, tên sản phẩm..."
                  className="input !h-8 text-xs w-64"
                />

                <select name="type" defaultValue={sp.type || ""} className="select !h-8 text-xs !py-0">
                  <option value="">Tất cả loại sản phẩm</option>
                  <option value="PACKAGE">Gói giải pháp (Package)</option>
                  <option value="SUBSCRIPTION">Thuê bao phần mềm</option>
                  <option value="MODULE">Mô-đun tính năng</option>
                  <option value="SERVICE">Dịch vụ triển khai</option>
                  <option value="TRAINING">Dịch vụ đào tạo</option>
                </select>

                <select name="category" defaultValue={sp.category || ""} className="select !h-8 text-xs !py-0">
                  <option value="">Tất cả nhóm</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <SubmitButton size="sm" variant="secondary" icon="search">
                  Lọc
                </SubmitButton>
                {(sp.q || sp.type || sp.category) && (
                  <Link href="/catalog?tab=products" className="text-xs text-ink-3 hover:underline">
                    Xóa lọc
                  </Link>
                )}
              </form>
            </div>

            <div className="rounded-lg bg-surface shadow-[var(--shadow-4)]">
              <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2.5 text-sm text-ink-3">
                <span>Danh mục sản phẩm và dịch vụ</span>
                <span>{products.length} bản ghi</span>
              </div>

              {products.length ? (
                <Grid>
                  <thead>
                    <tr>
                      <th>Mã sản phẩm</th>
                      <th>Tên sản phẩm / Dịch vụ</th>
                      <th>Loại</th>
                      <th>Nhóm danh mục</th>
                      <th>Đơn vị tính</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono font-semibold">
                          <Link className="link" href={`/catalog/products/${p.id}`}>
                            {p.code}
                          </Link>
                        </td>
                        <td>
                          <Link className="link font-medium" href={`/catalog/products/${p.id}`}>
                            {p.name}
                          </Link>
                          {p.description && (
                            <div className="text-xs text-ink-3 truncate max-w-md">{p.description}</div>
                          )}
                        </td>
                        <td>
                          <ProductTypeBadge type={p.type} />
                        </td>
                        <td>{p.category || "—"}</td>
                        <td>{p.unit}</td>
                        <td>
                          <ProductStatusBadge active={p.active} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Grid>
              ) : (
                <Empty icon="product">Không tìm thấy sản phẩm nào phù hợp</Empty>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: BẢNG GIÁ & PHÂN KHÚC */}
        {tab === "price_lists" && (
          <div className="space-y-4">
            <MessageBar intent="info">
              Mỗi bảng giá có loại tiền tệ duy nhất, thời gian hiệu lực và thuế suất GTGT theo từng dòng. Bảng giá tự động gán theo phân khúc khách hàng (SMB dưới 200 nhân sự, Enterprise từ 200 nhân sự trở lên).
            </MessageBar>

            <div className="rounded-lg bg-surface shadow-[var(--shadow-4)]">
              <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2.5 text-sm text-ink-3">
                <span>Danh sách bảng giá</span>
                <span>{priceLists.length} bảng giá</span>
              </div>

              {priceLists.length ? (
                <Grid>
                  <thead>
                    <tr>
                      <th>Tên bảng giá</th>
                      <th>Phân khúc khách hàng</th>
                      <th>Loại tiền</th>
                      <th>Hiệu lực từ</th>
                      <th>Hiệu lực đến</th>
                      <th>Số mục giá</th>
                      <th>Mặc định</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceLists.map((pl) => (
                      <tr key={pl.id}>
                        <td>
                          <Link className="link font-semibold" href={`/catalog/price-lists/${pl.id}`}>
                            {pl.name}
                          </Link>
                          {pl.description && (
                            <div className="text-xs text-ink-3 truncate max-w-sm">{pl.description}</div>
                          )}
                        </td>
                        <td>
                          <CustomerSegmentBadge segment={pl.customer_segment} />
                        </td>
                        <td className="font-mono font-medium">{pl.currency}</td>
                        <td>{formatDate(pl.valid_from)}</td>
                        <td>{formatDate(pl.valid_to)}</td>
                        <td>{pl.items_count || 0} sản phẩm</td>
                        <td>
                          {pl.is_default ? (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 font-medium">
                              Mặc định
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <ProductStatusBadge active={pl.active} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Grid>
              ) : (
                <Empty icon="money">Chưa có bảng giá nào</Empty>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CHÍNH SÁCH CHIẾT KHẤU */}
        {tab === "discounts" && (
          <div className="max-w-3xl space-y-4">
            <Card title="Chính sách chiết khấu và hạn mức duyệt">
              <div className="space-y-4">
                <div className="rounded-md border border-stroke bg-gray-50/60 p-4 text-sm space-y-2">
                  <div className="font-semibold text-ink-1">Quy tắc chiết khấu:</div>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-ink-2">
                    <li>
                      <strong>Chiết khấu tự động (≤ {discountThreshold}%):</strong> Nhân viên kinh doanh (SALES) được phép tự áp dụng vào báo giá mà không cần phê duyệt.
                    </li>
                    <li>
                      <strong>Chiết khấu cần duyệt (&gt; {discountThreshold}% đến {discountMax}%):</strong> Cần Quản lý kinh doanh (SALES_MANAGER) phê duyệt trước khi gửi cho khách hàng.
                    </li>
                    <li>
                      <strong>Chiết khấu vượt mức (&gt; {discountMax}%):</strong> Hệ thống chặn hoàn toàn, không cho phép áp dụng.
                    </li>
                  </ul>
                </div>

                {canWriteDiscount ? (
                  <form action={updateDiscountPolicyAction} className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2">
                    <FormField
                      label="Hạn mức chiết khấu nhân viên tự áp (%)"
                      required
                      hint="Mặc định: 10%. Mức chiết khấu không cần phê duyệt."
                    >
                      <input
                        name="threshold_pct"
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={discountThreshold}
                        required
                        className="input"
                      />
                    </FormField>

                    <FormField
                      label="Hạn mức chiết khấu tối đa cho phép (%)"
                      required
                      hint="Mặc định: 30%. Trên mức này hệ thống sẽ từ chối."
                    >
                      <input
                        name="max_pct"
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={discountMax}
                        required
                        className="input"
                      />
                    </FormField>

                    <div className="md:col-span-2 pt-2">
                      <SubmitButton variant="primary" icon="save">
                        Lưu chính sách chiết khấu
                      </SubmitButton>
                    </div>
                  </form>
                ) : (
                  <MessageBar intent="info">
                    Bạn chỉ có quyền xem chính sách chiết khấu. Chỉ Quản lý kinh doanh (SALES_MANAGER) mới có quyền chỉnh sửa các tham số này.
                  </MessageBar>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
