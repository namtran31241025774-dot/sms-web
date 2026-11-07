import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityNextActions } from "@/components/opportunity-next-actions";

describe("Opportunity research result rendering", () => {
  it("FR-44: BUG-045 renders structured Agent actions without crashing server rendering", () => {
    const serialized = JSON.stringify([
      { action: "Chuẩn bị bảng so sánh đối thủ", owner_role: "AE", why: "Khách đang cân nhắc giải pháp khác" },
      { action: "Đặt lịch gặp người quyết định", owner_role: "AE", why: "Chưa xác minh thẩm quyền" },
    ]);
    // Passing either object directly as a React child reproduced the failing research page.
    const markup = renderToStaticMarkup(createElement(OpportunityNextActions, { serialized }));
    expect(markup).toContain("Chuẩn bị bảng so sánh đối thủ");
    expect(markup).toContain("Khách đang cân nhắc giải pháp khác");
    expect(markup).toContain("AE");
    expect(markup).toContain("Đặt lịch gặp người quyết định");
    expect(markup.match(/<li>/g)).toHaveLength(2);
  });

  it("FR-36: BUG-045 still displays research saved with legacy string actions", () => {
    const markup = renderToStaticMarkup(createElement(OpportunityNextActions, {
      serialized: JSON.stringify(["Họp kỹ thuật", "Làm rõ nhu cầu"]),
    }));
    expect(markup).toContain("Họp kỹ thuật");
    expect(markup).toContain("Làm rõ nhu cầu");
  });

  it("FR-36: BUG-045 corrupt saved action JSON cannot crash the result page", () => {
    const markup = renderToStaticMarkup(createElement(OpportunityNextActions, { serialized: "{broken" }));
    expect(markup).toContain("Không đọc được hành động đề xuất.");
  });
});
