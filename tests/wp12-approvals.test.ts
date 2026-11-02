import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApprovalsPage from "@/app/(app)/approvals/page";
import { all, db, get, run } from "@/lib/db";
import { backfillQuoteAccounts, backfillQuoteVersions } from "@/lib/db/migrations/wp12_001_backfill_quote_versions";
import { advanceStage, createSolution, expertReviewInfo, getOpportunity, listSolutions, reviewExpertSolution, submitExpertReview, updateSolution } from "@/lib/services/opportunities";
import { approvalTarget, decideStageGate, pendingExpertReviews, stageGateStatus } from "@/lib/services/approvals";
import { applyDiscountDecision, getLatestQuoteVersion, getQuote } from "@/lib/services/quotes";
import type { Actor } from "@/lib/services/core";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn(), usePathname: () => "/approvals", useRouter: () => ({}) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: 922, name: "Manager", role: "SALES_MANAGER" }),
  requirePermission: vi.fn(),
}));

const sales: Actor = { type: "USER", id: 921, name: "Sales", role: "SALES" };
const manager = { type: "USER" as const, id: 922, name: "Manager", role: "SALES_MANAGER" as const };
const outsider = { type: "USER" as const, id: 923, name: "Manager khác", role: "SALES_MANAGER" as const };
let team = 0;
let seq = 0;

function opportunity() {
  const code = `APPR-${++seq}`;
  const account = run("INSERT INTO accounts(name,name_norm) VALUES (?,?)", code, code).id;
  const priceList = get<{ id: number }>("SELECT id FROM price_lists LIMIT 1")?.id ?? run("INSERT INTO price_lists(name,currency) VALUES ('Giá','VND')").id;
  return run(
    `INSERT INTO opportunities(code,name,account_id,owner_id,team_id,stage,amount,importance,price_list_id,need_confirmed,solution_confirmed,stakeholders_confirmed,competitors_confirmed)
     VALUES (?,?,?,921,?,'DEVELOP',1000,'HIGH',?,1,1,1,1)`,
    code, code, account, team, priceList,
  ).id;
}

beforeEach(() => {
  run("INSERT OR IGNORE INTO users (id,name,email,role) VALUES (921,'Sales','appr-s@sms.local','SALES')");
  run("INSERT OR IGNORE INTO users (id,name,email,role) VALUES (922,'Manager','appr-m@sms.local','SALES_MANAGER')");
  run("INSERT OR IGNORE INTO users (id,name,email,role) VALUES (923,'Manager khác','appr-o@sms.local','SALES_MANAGER')");
  team = get<{ id: number }>("SELECT id FROM teams WHERE leader_id = 922")?.id ?? run("INSERT INTO teams(code,name,leader_id,active) VALUES ('APPR-TEAM','Nhóm duyệt',922,1)").id;
});

describe("Cổng duyệt chuyên môn", () => {
  const withSolution = () => {
    const opp = opportunity();
    createSolution(manager, opp, { title: "Tích hợp ERP", integration_required: true });
    return opp;
  };

  it("chưa có hồ sơ thì không gửi và không phê duyệt được, chỉ từ chối được", () => {
    const opp = opportunity();
    run("UPDATE opportunities SET amount=600000000 WHERE id=?", opp);
    expect(() => submitExpertReview(manager, opp)).toThrow(/hồ sơ giải pháp/);

    run("UPDATE opportunities SET expert_review_status='PENDING' WHERE id=?", opp);
    expect(() => reviewExpertSolution(manager, opp, "APPROVED")).toThrow(/hồ sơ giải pháp/);
    reviewExpertSolution(manager, opp, "REJECTED", "Chưa có hồ sơ");
    expect(getOpportunity(opp)?.expert_review_status).toBe("REJECTED");
  });

  it("từ chối phải có lý do, lý do hiện lại và tới người phụ trách", () => {
    const opp = withSolution();
    submitExpertReview(manager, opp);
    expect(() => reviewExpertSolution(manager, opp, "REJECTED", " ")).toThrow(/lý do/);
    reviewExpertSolution(manager, opp, "REJECTED", "Thiếu kiến trúc");

    const info = expertReviewInfo(opp);
    expect(info.note).toBe("Thiếu kiến trúc");
    expect(info.decision?.actor_label).toBe("Manager");
    expect(info.submitted?.actor_label).toBe("Manager");
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id=921 AND message LIKE ?", `%${getOpportunity(opp)!.code}: Thiếu kiến trúc`)?.n).toBe(1);

    submitExpertReview(manager, opp);
    expect(getOpportunity(opp)?.expert_review_status).toBe("PENDING");
  });

  it("đang chờ thì không gửi lại, chưa gửi thì không quyết định được", () => {
    const opp = withSolution();
    expect(() => reviewExpertSolution(manager, opp, "APPROVED")).toThrow(/đang chờ/);
    submitExpertReview(manager, opp);
    expect(() => submitExpertReview(manager, opp)).toThrow(/đã được gửi/);
  });

  it("sửa hoặc thêm hồ sơ sau khi đã duyệt thì phải gửi duyệt lại", () => {
    const opp = withSolution();
    const approve = () => {
      submitExpertReview(manager, opp);
      reviewExpertSolution(manager, opp, "APPROVED");
      expect(getOpportunity(opp)?.expert_review_status).toBe("APPROVED");
    };
    approve();
    updateSolution(manager, listSolutions(opp)[0].id, { architecture: "Hybrid" });
    expect(getOpportunity(opp)?.expert_review_status).toBe("NONE");
    expect(expertReviewInfo(opp).reset).toBe(true);

    approve();
    expect(expertReviewInfo(opp).reset).toBe(false);
    createSolution(manager, opp, { title: "Phương án 2" });
    expect(getOpportunity(opp)?.expert_review_status).toBe("NONE");
  });
});

describe("Màn hình phê duyệt", () => {
  it("cổng Propose: duyệt thì cơ hội chuyển giai đoạn và yêu cầu đóng lại", () => {
    const opp = opportunity();
    expect(advanceStage(sales, opp).moved).toBe(false);
    const a = get<{ id: number; status: string }>("SELECT id, status FROM approvals WHERE kind='OPP_STAGE_GATE' AND entity_id=?", opp)!;
    expect(a.status).toBe("PENDING");
    expect(approvalTarget("OPP_STAGE_GATE", opp)?.href).toBe(`/opportunities/${opp}`);

    expect(decideStageGate(manager, a.id, true, null)).toBe("PROPOSE");
    expect(getOpportunity(opp)?.stage).toBe("PROPOSE");
    expect(get<{ status: string }>("SELECT status FROM approvals WHERE id=?", a.id)?.status).toBe("APPROVED");
  });

  it("cổng Propose: từ chối phải có lý do, người ngoài phạm vi không duyệt được, cơ hội giữ nguyên", () => {
    const opp = opportunity();
    advanceStage(sales, opp);
    const a = get<{ id: number }>("SELECT id FROM approvals WHERE kind='OPP_STAGE_GATE' AND entity_id=?", opp)!;

    expect(() => decideStageGate(sales, a.id, true, null)).toThrow();
    expect(() => decideStageGate(outsider, a.id, true, null)).toThrow(/phạm vi/);
    expect(() => decideStageGate(manager, a.id, false, " ")).toThrow(/lý do/);

    expect(decideStageGate(manager, a.id, false, "Cần xử lý rủi ro")).toBe("DEVELOP");
    expect(() => decideStageGate(manager, a.id, true, null)).toThrow(/đã được xử lý/);
  });

  it("chỉ báo cho quản lý phụ trách nhóm và hiện đúng trạng thái cổng", () => {
    const opp = opportunity();
    const count = (userId: number) => get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND link='/approvals'", userId)!.n;
    const [mine, other] = [count(922), count(923)];
    expect(stageGateStatus(getOpportunity(opp)!)).toMatchObject({ required: true, status: null, passed: false });

    advanceStage(sales, opp);
    expect(count(922)).toBe(mine + 1);
    expect(count(923)).toBe(other);
    expect(stageGateStatus(getOpportunity(opp)!)).toMatchObject({ status: "PENDING", deciders: ["Manager"] });

    const a = get<{ id: number }>("SELECT id FROM approvals WHERE kind='OPP_STAGE_GATE' AND entity_id=?", opp)!;
    decideStageGate(manager, a.id, false, "Thiếu người quyết định");
    expect(stageGateStatus(getOpportunity(opp)!)).toMatchObject({ status: "REJECTED", decidedBy: "Manager", comment: "Thiếu người quyết định" });
  });

  it("màn hình hiện link chi tiết và nút duyệt, từ chối cho cổng Propose", async () => {
    const opp = opportunity();
    advanceStage(sales, opp);
    run("UPDATE opportunities SET expert_review_status='PENDING' WHERE id=?", opportunity());
    const html = renderToStaticMarkup(await ApprovalsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain(`href="/opportunities/${opp}"`);
    expect(html).toContain("CỔNG GIAI ĐOẠN");
    expect(html).toContain("Lý do từ chối...");
    expect(html).toContain("DUYỆT CHUYÊN MÔN");
    expect(html).toContain("Xem chi tiết và duyệt");
  });

  it("báo giá chưa có phiên bản được bổ sung để mở được trang chi tiết", () => {
    const opp = opportunity();
    const quote = run("INSERT INTO quotes(code,opportunity_id,price_list_id,status) VALUES (?,?,?,'PENDING_APPROVAL')", `QB-${seq}`, opp, getOpportunity(opp)!.price_list_id).id;
    backfillQuoteVersions(db());
    backfillQuoteVersions(db());
    expect(all("SELECT id FROM quote_versions WHERE quote_id=?", quote)).toHaveLength(1);
    expect(getLatestQuoteVersion(quote)?.status).toBe("PENDING_APPROVAL");
    expect(getQuote(quote)).toBeUndefined();
    backfillQuoteAccounts(db());
    expect(getQuote(quote)?.account_id).toBe(getOpportunity(opp)?.account_id);
  });

  it("nút duyệt cổng không dùng được cho loại yêu cầu khác", () => {
    const a = run("INSERT INTO approvals(kind,entity_type,entity_id,reason,requested_by) VALUES ('QUOTE_DISCOUNT','quote',999999,'x',921)").id;
    expect(() => decideStageGate(manager, a, true, null)).toThrow(/không phải cổng/);
  });

  it("duyệt chuyên môn chờ xử lý hiện cho đúng người duyệt trong phạm vi", () => {
    const opp = opportunity();
    run("UPDATE opportunities SET expert_review_status='PENDING' WHERE id=?", opp);
    expect(pendingExpertReviews(manager).map((o) => o.id)).toContain(opp);
    expect(pendingExpertReviews(outsider).map((o) => o.id)).not.toContain(opp);
    run("UPDATE opportunities SET expert_review_status='APPROVED' WHERE id=?", opp);
    expect(pendingExpertReviews(manager).map((o) => o.id)).not.toContain(opp);
  });

  it("duyệt chiết khấu ở trang báo giá cũng đóng yêu cầu trong danh sách", () => {
    const opp = opportunity();
    const quote = run("INSERT INTO quotes(code,opportunity_id,price_list_id,status) VALUES (?,?,?,'PENDING_APPROVAL')", `QA-${seq}`, opp, getOpportunity(opp)!.price_list_id).id;
    const version = run("INSERT INTO quote_versions(quote_id,version_no,status) VALUES (?,1,'PENDING_APPROVAL')", quote).id;
    const a = run("INSERT INTO approvals(kind,entity_type,entity_id,reason,requested_by) VALUES ('QUOTE_DISCOUNT','quote',?,'Chiết khấu',921)", version).id;
    expect(approvalTarget("QUOTE_DISCOUNT", version)?.href).toBe(`/quotes/${quote}?v=${version}`);

    applyDiscountDecision(manager, version, true, "Đồng ý");
    const row = get<{ status: string; decided_by: number }>("SELECT status, decided_by FROM approvals WHERE id=?", a)!;
    expect(row).toMatchObject({ status: "APPROVED", decided_by: 922 });
  });
});
