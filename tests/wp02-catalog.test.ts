import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { seedWp02 } from "@/lib/db/seeds/wp02";
import type { Actor } from "@/lib/services/core";
import {
  createProduct,
  updateProduct,
  getProduct,
  getProductByCode,
  listProducts,
  deactivateProduct,
  activateProduct,
  getPackageComponents,
  addPackageComponent,
  removePackageComponent,
} from "@/lib/services/catalog";
import {
  createPriceList,
  getPriceList,
  setPriceListItem,
  removePriceListItem,
  getPriceListItems,
  getApplicablePriceList,
  priceFor,
  checkDiscount,
  updateDiscountPolicy,
} from "@/lib/services/pricing";

const presalesActor: Actor = {
  type: "USER",
  id: 3,
  name: "Lê Minh Châu",
  role: "PRESALES",
};

const managerActor: Actor = {
  type: "USER",
  id: 4,
  name: "Phạm Quốc Dũng",
  role: "SALES_MANAGER",
};

describe("WP-02: Sản phẩm, Dịch vụ và Bảng giá (FR-21 → FR-29)", () => {
  beforeEach(() => {
    seedWp02(db());
  });

  // FR-21 & FR-23: Tạo và Tra cứu sản phẩm / dịch vụ
  describe("FR-21 & FR-23: Tạo và Tra cứu sản phẩm, dịch vụ (Catalog)", () => {
    it("FR-21: tạo sản phẩm mới và kiểm tra chặn trùng lặp mã sản phẩm", () => {
      const prodId = createProduct(presalesActor, {
        code: "SV-TEST-01",
        name: "Dịch vụ Tích hợp Cổng thanh toán",
        type: "SERVICE",
        category: "Integration",
        unit: "gói",
        description: "Tích hợp cổng VNPay/MoMo vào hệ thống bán hàng",
      });

      expect(prodId).toBeGreaterThan(0);
      const prod = getProduct(prodId);
      expect(prod?.code).toBe("SV-TEST-01");
      expect(prod?.type).toBe("SERVICE");
      expect(prod?.active).toBe(1);

      // Kiểm tra chặn trùng mã
      expect(() => {
        createProduct(presalesActor, {
          code: "SV-TEST-01",
          name: "Trùng mã",
          type: "SERVICE",
          unit: "gói",
        });
      }).toThrow(/đã tồn tại/);
    });

    it("FR-23: tra cứu và lọc sản phẩm theo mã, loại và nhóm danh mục", () => {
      const allServices = listProducts({ type: "SERVICE" });
      expect(allServices.length).toBeGreaterThan(0);
      expect(allServices.every((s) => s.type === "SERVICE")).toBe(true);

      const byCode = getProductByCode("SC-STD");
      expect(byCode).toBeDefined();
      expect(byCode?.name).toContain("Sales Cloud");

      const searchRes = listProducts({ q: "Đào tạo" });
      expect(searchRes.length).toBeGreaterThan(0);
    });
  });

  // FR-22: Ngừng kinh doanh và kích hoạt lại
  describe("FR-22: Ngừng kinh doanh và Kích hoạt lại sản phẩm", () => {
    it("chuyển sang trạng thái ngừng kinh doanh và kích hoạt lại, bảo toàn dữ liệu", () => {
      const prodId = createProduct(presalesActor, {
        code: "SV-LEGACY",
        name: "Dịch vụ Cũ sắp ngừng",
        type: "SERVICE",
        unit: "gói",
      });

      // Ngừng kinh doanh
      deactivateProduct(managerActor, prodId);
      const deactivated = getProduct(prodId);
      expect(deactivated?.active).toBe(0);

      // Danh sách active = 1 không còn chứa sản phẩm này
      const activeList = listProducts({ active: 1 });
      expect(activeList.some((p) => p.id === prodId)).toBe(false);

      // Kích hoạt lại
      activateProduct(managerActor, prodId);
      const reactivated = getProduct(prodId);
      expect(reactivated?.active).toBe(1);
    });
  });

  // FR-24: Mô-đun phần mềm
  describe("FR-24: Quản lý danh mục mô-đun phần mềm", () => {
    it("tạo và phân loại mô-đun phần mềm để sử dụng khi cấu hình giải pháp", () => {
      const modId = createProduct(presalesActor, {
        code: "MOD-ANALYTICS",
        name: "Mô-đun Phân tích & Báo cáo nâng cao",
        type: "MODULE",
        category: "Analytics",
        unit: "module",
        description: "Báo cáo phễu chuyển đổi, phân tích hiệu suất và dự báo",
      });

      const mod = getProduct(modId);
      expect(mod?.type).toBe("MODULE");
      expect(mod?.category).toBe("Analytics");
    });
  });

  // FR-25: Gói thuê bao và thành phần gói
  describe("FR-25: Thiết lập gói thuê bao SaaS và thành phần cấu thành (Package)", () => {
    it("tạo gói giải pháp và thêm các thành phần mô-đun vào gói, ngăn tự chứa", () => {
      // 1. Tạo gói
      const pkgId = createProduct(presalesActor, {
        code: "SC-CUSTOM-BUNDLE",
        name: "Gói Tùy chỉnh Doanh nghiệp",
        type: "PACKAGE",
        unit: "user/năm",
      });

      const mod1 = getProductByCode("MOD-CRM");
      const mod2 = getProductByCode("MOD-CPQ");
      expect(mod1).toBeDefined();
      expect(mod2).toBeDefined();

      // 2. Thêm thành phần vào gói
      addPackageComponent(presalesActor, pkgId, mod1!.id, 1, false);
      addPackageComponent(presalesActor, pkgId, mod2!.id, 2, true); // tùy chọn

      const components = getPackageComponents(pkgId);
      expect(components.length).toBe(2);

      const requiredComp = components.find((c) => c.component_id === mod1!.id);
      expect(requiredComp?.is_optional).toBe(0);

      const optComp = components.find((c) => c.component_id === mod2!.id);
      expect(optComp?.is_optional).toBe(1);
      expect(optComp?.quantity).toBe(2);

      // 3. Ngăn gói tự chứa chính nó
      expect(() => {
        addPackageComponent(presalesActor, pkgId, pkgId);
      }).toThrow(/không thể chứa chính nó/);

      // 4. Gỡ bỏ thành phần
      removePackageComponent(presalesActor, pkgId, mod2!.id);
      const componentsAfter = getPackageComponents(pkgId);
      expect(componentsAfter.length).toBe(1);
    });
  });

  // FR-26: Chính sách bản quyền (License Policy)
  describe("FR-26: Cập nhật dữ liệu và chính sách quyền sử dụng (License Policy)", () => {
    it("lưu trữ và cập nhật điều kiện cấp phép quyền sử dụng và kỳ tính cước", () => {
      const prodId = createProduct(presalesActor, {
        code: "SC-LICENSE-TEST",
        name: "Sản phẩm kiểm tra bản quyền",
        type: "SUBSCRIPTION",
        unit: "user/năm",
        license_policy: {
          license_type: "NAMED_USER",
          min_quantity: 10,
          billing_cycle: "ANNUAL",
          terms_note: "Tối thiểu 10 người dùng, cam kết 12 tháng",
        },
      });

      const prod = getProduct(prodId);
      expect(prod?.license_policy).toContain("NAMED_USER");
      expect(prod?.license_policy).toContain("10");

      // Cập nhật policy
      updateProduct(presalesActor, prodId, {
        license_policy: {
          license_type: "CONCURRENT",
          min_quantity: 20,
          billing_cycle: "ANNUAL",
        },
      });

      const updated = getProduct(prodId);
      expect(updated?.license_policy).toContain("CONCURRENT");
      expect(updated?.license_policy).toContain("20");
    });
  });

  // FR-27 & BR-22: Thiết lập bảng giá chuẩn
  describe("FR-27 & BR-22: Thiết lập Bảng giá chuẩn và thuế suất GTGT", () => {
    it("tạo bảng giá mới có thời gian hiệu lực và đơn giá kèm thuế suất từng mặt hàng", () => {
      const plId = createPriceList(managerActor, {
        name: "Bảng giá Thử nghiệm 2026",
        currency: "VND",
        customer_segment: "ALL",
        valid_from: "2026-01-01",
        valid_to: "2026-12-31",
      });

      expect(plId).toBeGreaterThan(0);
      const pl = getPriceList(plId);
      expect(pl?.name).toBe("Bảng giá Thử nghiệm 2026");
      expect(pl?.currency).toBe("VND");

      const prod = getProductByCode("SC-STD");
      expect(prod).toBeDefined();

      // Thiết lập đơn giá và thuế suất (10% VAT theo BR-22)
      setPriceListItem(managerActor, plId, prod!.id, 3_500_000, 10);

      const items = getPriceListItems(plId);
      expect(items.length).toBe(1);
      expect(items[0].unit_price).toBe(3_500_000);
      expect(items[0].tax_pct).toBe(10);

      // Kiểm tra hợp đồng priceFor
      const pricingInfo = priceFor(plId, prod!.id);
      expect(pricingInfo).toBeDefined();
      expect(pricingInfo?.unitPrice).toBe(3_500_000);
      expect(pricingInfo?.taxPct).toBe(10);
      expect(pricingInfo?.currency).toBe("VND");

      // Gỡ bỏ mặt hàng
      removePriceListItem(managerActor, plId, prod!.id);
      expect(getPriceListItems(plId).length).toBe(0);
    });
  });

  // FR-28 & BR-03: Thiết lập giá theo phân khúc khách hàng
  describe("FR-28 & BR-03: Giá theo phân khúc khách hàng (SMB & Enterprise)", () => {
    it("tự động lựa chọn bảng giá phù hợp theo số lượng nhân sự hoặc phân khúc chỉ định", () => {
      // 1. Khách hàng SMB (< 200 nhân sự): chọn bảng giá SMB
      const smbPriceList = getApplicablePriceList({ employeeCount: 50 });
      expect(smbPriceList).toBeDefined();
      expect(smbPriceList?.customer_segment).toBe("SMB");

      // 2. Khách hàng Enterprise (>= 200 nhân sự theo BR-03): chọn bảng giá Enterprise
      const entPriceList = getApplicablePriceList({ employeeCount: 250 });
      expect(entPriceList).toBeDefined();
      expect(entPriceList?.customer_segment).toBe("ENTERPRISE");

      // 3. Khách hàng chỉ định trực tiếp phân khúc
      const directEnt = getApplicablePriceList({ customerSegment: "ENTERPRISE" });
      expect(directEnt?.customer_segment).toBe("ENTERPRISE");
    });
  });

  // FR-29 & BR-05: Chính sách chiết khấu và hạn mức duyệt
  describe("FR-29 & BR-05: Kiểm tra chính sách chiết khấu và hạn mức duyệt", () => {
    it("cho phép nhân viên tự áp dụng chiết khấu <= 10%", () => {
      const res = checkDiscount(8, "SALES");
      expect(res.allowed).toBe(true);
      expect(res.requiresApproval).toBe(false);

      const resEdge = checkDiscount(10, "SALES");
      expect(resEdge.allowed).toBe(true);
      expect(resEdge.requiresApproval).toBe(false);
    });

    it("yêu cầu Quản lý kinh doanh phê duyệt đối với chiết khấu từ > 10% đến 30%", () => {
      // NVKD áp dụng 15%: cần duyệt
      const resSales = checkDiscount(15, "SALES");
      expect(resSales.allowed).toBe(true);
      expect(resSales.requiresApproval).toBe(true);
      expect(resSales.message).toContain("Quản lý kinh doanh");

      // Quản lý kinh doanh áp dụng 15%: tự duyệt được (không cần cấp trên)
      const resManager = checkDiscount(15, "SALES_MANAGER");
      expect(resManager.allowed).toBe(true);
      expect(resManager.requiresApproval).toBe(false);
    });

    it("chặn hoàn toàn chiết khấu vượt quá 30% theo BR-05", () => {
      const resExceeded = checkDiscount(35, "SALES");
      expect(resExceeded.allowed).toBe(false);
      expect(resExceeded.message).toContain("vượt quá hạn mức tối đa");
    });

    it("Quản lý kinh doanh cập nhật chính sách chiết khấu trong settings", () => {
      updateDiscountPolicy(managerActor, 12, 35);

      const resAfter = checkDiscount(11, "SALES");
      expect(resAfter.allowed).toBe(true);
      expect(resAfter.requiresApproval).toBe(false); // <= 12% không cần duyệt

      const resManagerAfter = checkDiscount(32, "SALES_MANAGER");
      expect(resManagerAfter.allowed).toBe(true); // <= 35% được duyệt

      // Khôi phục lại mặc định BR-05
      updateDiscountPolicy(managerActor, 10, 30);
    });
  });
});
