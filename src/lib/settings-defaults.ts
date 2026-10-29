// Giá trị mặc định của tham số cấu hình hệ thống (metadata).
// Căn cứ theo docs/requirements/BUSINESS-RULES.md và DECISIONS.md.
// Quản trị viên và người quản lý có thể chỉnh sửa trong trang Quản trị.

export interface SettingDefinition {
  value: string;
  description: string;
}

export const SETTING_DEFAULTS: Record<string, SettingDefinition> = {
  // BR-01: Chấm điểm BANT
  bant_threshold: {
    value: "60",
    description: "Điểm BANT tối thiểu (0–100) để Lead đủ chuẩn chuyển đổi (BR-01, FR-31)",
  },

  // BR-02: Phân loại Lead
  lead_rating_warm_min: {
    value: "40",
    description: "Ngưỡng điểm BANT tối thiểu cho mức Ấm (40-59) (BR-02, FR-10)",
  },

  // BR-03: Phân khúc khách hàng
  segment_enterprise_min_employees: {
    value: "200",
    description: "Số lượng nhân sự tối thiểu để xếp vào nhóm khách hàng Enterprise (BR-03, FR-28)",
  },

  // BR-04: Hồ sơ khách hàng mục tiêu (TCP)
  qualification_tcp: {
    value: "Doanh nghiệp B2B từ 50 nhân sự, đội Sales từ 5 người, ngành sản xuất / phân phối / dịch vụ CNTT, hoạt động tại Việt Nam.",
    description: "Chân dung khách hàng mục tiêu (TCP) dùng để sàng lọc (BR-04, FR-06, FR-88)",
  },

  // BR-05: Chiết khấu và hạn mức duyệt
  discount_threshold_pct: {
    value: "10",
    description: "Ngưỡng chiết khấu (%) NVKD được tự quyết; vượt ngưỡng cần QLKD duyệt (BR-05, FR-29)",
  },
  discount_max_pct: {
    value: "30",
    description: "Mức chiết khấu tối đa (%); vượt quá mức này hệ thống không cho phép (BR-05, FR-29)",
  },

  // BR-06: Cổng duyệt QLKD ở giai đoạn cơ hội
  manager_gate_mode: {
    value: "HIGH_OR_OPEN_RISK",
    description: "Điều kiện QLKD rà soát trước khi chuyển Develop→Propose: HIGH_OR_OPEN_RISK | ALWAYS | NEVER (BR-06, FR-45)",
  },

  // BR-07: Rà soát chuyên môn
  expert_review_enabled: {
    value: "true",
    description: "Bật/tắt cổng rà soát chuyên môn giải pháp (FR-42, BR-07)",
  },
  expert_review_min_amount: {
    value: "500000000",
    description: "Doanh thu ước tính tối thiểu (VND) bắt buộc rà soát chuyên môn (BR-07, FR-42)",
  },

  // BR-08: Mức quan trọng cơ hội
  importance_high_amount: {
    value: "500000000",
    description: "Ngưỡng doanh thu cơ hội mức quan trọng Cao (VND) (BR-08, FR-44)",
  },
  importance_medium_amount: {
    value: "100000000",
    description: "Ngưỡng doanh thu cơ hội mức quan trọng Trung bình (VND) (BR-08, FR-44)",
  },

  // BR-09: Hiệu lực báo giá
  quote_valid_days: {
    value: "30",
    description: "Số ngày hiệu lực mặc định của báo giá kể từ ngày gửi (BR-09, FR-53)",
  },
  accepted_quote_order_window_days: {
    value: "30",
    description: "Số ngày tối đa từ khi khách chấp thuận báo giá đến khi tạo đơn (BR-09, FR-56)",
  },

  // BR-10: Đơn hàng thủ công
  allow_direct_order: {
    value: "true",
    description: "Cho phép người có thẩm quyền tạo đơn hàng trực tiếp không qua báo giá (BR-10, FR-57)",
  },

  // DEC-09: Kiểm tra hoá đơn nháp độc lập
  invoice_independent_review: {
    value: "false",
    description: "Bắt buộc người kiểm tra hoá đơn nháp độc lập với người lập (DEC-09, FR-66)",
  },

  // BR-13: Nhắc thanh toán
  payment_reminder_days: {
    value: "7",
    description: "Chu kỳ gửi việc nhắc thanh toán công nợ quá hạn (ngày) (BR-13, FR-71)",
  },

  // BR-14: Xác suất dự báo doanh thu
  forecast_prob_develop: {
    value: "20",
    description: "Xác suất thành công giai đoạn Phát triển cơ hội (%) (BR-14, FR-86)",
  },
  forecast_prob_propose: {
    value: "50",
    description: "Xác suất thành công giai đoạn Đề xuất giải pháp (%) (BR-14, FR-86)",
  },
  forecast_prob_close: {
    value: "80",
    description: "Xác suất thành công giai đoạn Tạo đơn hàng (%) (BR-14, FR-86)",
  },

  // BR-15: Chu kỳ làm mới cơ hội
  opp_refresh_hours: {
    value: "6",
    description: "Chu kỳ Opportunity Agent làm mới nghiên cứu cơ hội (giờ) (BR-15, FR-36)",
  },
  // BR-28: Bộ quy tắc của Opportunity Agent
  opp_close_warning_days: {
    value: "21",
    description: "Số ngày còn lại tới ngày chốt mà cơ hội vẫn ở Develop thì gắn rủi ro tiến độ (OPP-R06, BR-28)",
  },
  ai_min_confidence: {
    value: "0.6",
    description: "Độ bao phủ dữ liệu tối thiểu của bộ quy tắc; thấp hơn thì kết quả gắn cờ cần bổ sung dữ liệu (BR-28)",
  },
  email_window_days: {
    value: "30",
    description: "Cửa sổ email gần nhất Opportunity Agent được đọc (ngày) (BR-15, FR-89)",
  },

  // BR-16: Ngân sách token AI
  ai_daily_token_budget: {
    value: "200000",
    description: "Ngân sách token hàng ngày cho mỗi Agent (BR-16, FR-91)",
  },
  ai_budget_warn_pct: {
    value: "80",
    description: "Ngưỡng cảnh báo ngân sách token hàng ngày (%) (BR-16, FR-91)",
  },
  ai_max_iterations: {
    value: "15",
    description: "Số vòng gọi công cụ tối đa cho một lần chạy Agent (BR-16, NFR-09)",
  },

  // BR-17: Mở lại cơ hội đã đóng
  reopen_window_days: {
    value: "90",
    description: "Thời hạn tối đa cho phép QLKD mở lại cơ hội đã đóng (ngày) (BR-17, FR-47)",
  },

  // BR-22: Thuế suất GTGT
  default_vat_pct: {
    value: "10",
    description: "Thuế suất GTGT (%) mặc định cho các dòng bảng giá (BR-22, FR-27)",
  },

  // BR-23: Giám sát và cảnh báo Agent
  ai_alert_failure_rate_pct: {
    value: "20",
    description: "Tỷ lệ chạy lỗi trong 24h kích hoạt cảnh báo giám sát (%) (BR-23, FR-90)",
  },
  ai_alert_min_runs: {
    value: "5",
    description: "Số lần chạy tối thiểu trong 24h để tính tỷ lệ lỗi cảnh báo (BR-23, FR-90)",
  },
  ai_run_timeout_sec: {
    value: "300",
    description: "Thời gian tối đa một lần chạy Agent trước khi coi là timeout (giây) (BR-23, FR-94)",
  },

  // BR-24: Giới hạn & chi phí mỗi lần chạy
  ai_max_tokens_per_run: {
    value: "60000",
    description: "Số token tối đa cho mỗi lần chạy Agent (BR-24, NFR-09)",
  },
  ai_max_web_searches_per_run: {
    value: "5",
    description: "Số lượt tìm kiếm web tối đa cho mỗi lần chạy Agent (BR-24, NFR-09)",
  },
  llm_price_input_per_mtok: {
    value: "",
    description: "Đơn giá token đầu vào trên 1 triệu token (BR-24, FR-91)",
  },
  llm_price_output_per_mtok: {
    value: "",
    description: "Đơn giá token đầu ra trên 1 triệu token (BR-24, FR-91)",
  },
  llm_price_web_search_per_call: {
    value: "",
    description: "Đơn giá mỗi lượt tìm kiếm web (BR-24, FR-91)",
  },
  llm_price_checked_on: {
    value: "",
    description: "Ngày kiểm tra bảng giá LLM gần nhất (BR-24, FR-91)",
  },

  // BR-25: Kiểm soát mô hình & kích hoạt
  llm_allowed_models: {
    value: "gpt-4o-2024-08-06,gpt-4o-mini-2024-07-18",
    description: "Danh sách model OpenAI được phép chọn (BR-25, FR-88)",
  },
  ai_require_eval_before_activate: {
    value: "true",
    description: "Bắt buộc có kết quả đánh giá đạt chuẩn trước khi kích hoạt cấu hình Agent (BR-25, NFR-08)",
  },

  // DEC-02, DEC-03: Kích hoạt Agent & Tự động hoá
  agent_qualification_enabled: {
    value: "true",
    description: "Bật/tắt Sales Qualification Agent (DEC-02, FR-88)",
  },
  agent_opportunity_enabled: {
    value: "true",
    description: "Bật/tắt Sales Opportunity Agent (DEC-02, FR-89)",
  },
  ai_auto_convert: {
    value: "false",
    description: "Cho phép Agent tự động chuyển đổi Lead (mặc định false = chỉ đề xuất) (DEC-03, FR-33)",
  },
};
