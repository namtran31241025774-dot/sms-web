"use server";

import { act, id, num, optStr, str } from "@/lib/action";
import { requirePermission } from "@/lib/auth";
import { userActor } from "@/lib/services/core";
import {
  activateProduct,
  addPackageComponent,
  createProduct,
  deactivateProduct,
  removePackageComponent,
  updateProduct,
  type ProductInput,
  type ProductType,
} from "@/lib/services/catalog";
import {
  activatePriceList,
  createPriceList,
  deactivatePriceList,
  removePriceListItem,
  setPriceListItem,
  updateDiscountPolicy,
  updatePriceList,
  type CustomerSegment,
  type PriceListInput,
} from "@/lib/services/pricing";

// ===== SẢN PHẨM & DỊCH VỤ (FR-21, FR-22, FR-24, FR-25, FR-26) =====

function productInput(fd: FormData): ProductInput {
  return {
    code: str(fd, "code"),
    name: str(fd, "name"),
    type: str(fd, "type") as ProductType,
    category: optStr(fd, "category"),
    unit: str(fd, "unit"),
    description: optStr(fd, "description"),
    license_policy: optStr(fd, "license_policy"),
  };
}

export async function createProductAction(fd: FormData) {
  let newId = 0;
  await act(
    "/catalog",
    async () => {
      const u = await requirePermission("catalog.write");
      newId = createProduct(userActor(u), productInput(fd));
      return { redirectTo: `/catalog/products/${newId}` };
    },
    "Đã tạo sản phẩm mới trong danh mục",
  );
}

export async function updateProductAction(fd: FormData) {
  const prodId = id(fd);
  await act(
    `/catalog/products/${prodId}`,
    async () => {
      const u = await requirePermission("catalog.write");
      updateProduct(userActor(u), prodId, productInput(fd));
    },
    "Đã cập nhật thông tin sản phẩm và chính sách sử dụng",
  );
}

export async function deactivateProductAction(fd: FormData) {
  const prodId = id(fd);
  await act(
    `/catalog/products/${prodId}`,
    async () => {
      const u = await requirePermission("catalog.write");
      deactivateProduct(userActor(u), prodId);
    },
    "Đã chuyển sản phẩm sang trạng thái Ngừng kinh doanh (FR-22)",
  );
}

export async function activateProductAction(fd: FormData) {
  const prodId = id(fd);
  await act(
    `/catalog/products/${prodId}`,
    async () => {
      const u = await requirePermission("catalog.write");
      activateProduct(userActor(u), prodId);
    },
    "Đã kích hoạt lại sản phẩm để tiếp tục kinh doanh (FR-22)",
  );
}

export async function addPackageComponentAction(fd: FormData) {
  const packageId = id(fd);
  const componentId = Number(fd.get("component_id"));
  const quantity = num(fd, "quantity") || 1;
  const isOptional = fd.get("is_optional") === "on";

  await act(
    `/catalog/products/${packageId}`,
    async () => {
      const u = await requirePermission("catalog.write");
      addPackageComponent(userActor(u), packageId, componentId, quantity, isOptional);
    },
    "Đã thêm thành phần vào gói giải pháp (FR-25)",
  );
}

export async function removePackageComponentAction(fd: FormData) {
  const packageId = id(fd);
  const componentId = Number(fd.get("component_id"));

  await act(
    `/catalog/products/${packageId}`,
    async () => {
      const u = await requirePermission("catalog.write");
      removePackageComponent(userActor(u), packageId, componentId);
    },
    "Đã gỡ bỏ thành phần khỏi gói giải pháp",
  );
}

// ===== BẢNG GIÁ & CHIẾT KHẤU (FR-27, FR-28, FR-29, BR-03, BR-05, BR-22) =====

function priceListInput(fd: FormData): PriceListInput {
  return {
    name: str(fd, "name"),
    currency: optStr(fd, "currency") || "VND",
    customer_segment: (optStr(fd, "customer_segment") as CustomerSegment) || "ALL",
    valid_from: optStr(fd, "valid_from"),
    valid_to: optStr(fd, "valid_to"),
    is_default: fd.get("is_default") === "on",
    description: optStr(fd, "description"),
  };
}

export async function createPriceListAction(fd: FormData) {
  let newId = 0;
  await act(
    "/catalog",
    async () => {
      const u = await requirePermission("pricelist.write");
      newId = createPriceList(userActor(u), priceListInput(fd));
      return { redirectTo: `/catalog/price-lists/${newId}` };
    },
    "Đã tạo bảng giá mới thành công",
  );
}

export async function updatePriceListAction(fd: FormData) {
  const plId = id(fd);
  await act(
    `/catalog/price-lists/${plId}`,
    async () => {
      const u = await requirePermission("pricelist.write");
      updatePriceList(userActor(u), plId, priceListInput(fd));
    },
    "Đã cập nhật thông tin bảng giá",
  );
}

export async function deactivatePriceListAction(fd: FormData) {
  const plId = id(fd);
  await act(
    `/catalog/price-lists/${plId}`,
    async () => {
      const u = await requirePermission("pricelist.write");
      deactivatePriceList(userActor(u), plId);
    },
    "Đã ngừng áp dụng bảng giá",
  );
}

export async function activatePriceListAction(fd: FormData) {
  const plId = id(fd);
  await act(
    `/catalog/price-lists/${plId}`,
    async () => {
      const u = await requirePermission("pricelist.write");
      activatePriceList(userActor(u), plId);
    },
    "Đã kích hoạt lại bảng giá",
  );
}

export async function setPriceListItemAction(fd: FormData) {
  const priceListId = id(fd);
  const productId = Number(fd.get("product_id"));
  const unitPrice = num(fd, "unit_price");
  const taxPct = num(fd, "tax_pct");

  await act(
    `/catalog/price-lists/${priceListId}`,
    async () => {
      const u = await requirePermission("pricelist.write");
      setPriceListItem(userActor(u), priceListId, productId, unitPrice, taxPct);
    },
    "Đã cập nhật đơn giá và thuế suất cho sản phẩm trong bảng giá (FR-27)",
  );
}

export async function removePriceListItemAction(fd: FormData) {
  const priceListId = id(fd);
  const productId = Number(fd.get("product_id"));

  await act(
    `/catalog/price-lists/${priceListId}`,
    async () => {
      const u = await requirePermission("pricelist.write");
      removePriceListItem(userActor(u), priceListId, productId);
    },
    "Đã gỡ bỏ sản phẩm khỏi bảng giá",
  );
}

export async function updateDiscountPolicyAction(fd: FormData) {
  const thresholdPct = num(fd, "threshold_pct");
  const maxPct = num(fd, "max_pct");

  await act(
    "/catalog?tab=discounts",
    async () => {
      const u = await requirePermission("discount.policy.write");
      updateDiscountPolicy(userActor(u), thresholdPct, maxPct);
    },
    "Đã cập nhật chính sách chiết khấu và hạn mức duyệt (BR-05)",
  );
}
