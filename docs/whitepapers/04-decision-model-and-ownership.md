# 04 · Mô hình quyết định và quyền sở hữu quy tắc (BR-28)

> **Mục đích.** Trả lời được câu hỏi "Kết quả này dựa trên quy tắc nào, dữ liệu nào, và ai chịu trách nhiệm xác nhận?". Kết quả của Opportunity Agent không được chấm từ đoạn văn của LLM, mà từ 10 quy tắc **OPP-R01..R10** do backend sở hữu (`src/lib/agents/rules.ts`).

## 1. Chuỗi giải thích của một nhận định

```text
Quy tắc        → OPP-R02: Đã ghi nhận người quyết định (BR-01 Authority)
Dữ liệu quan sát → 0 bên liên quan có vai trò DECISION_MAKER
Ngưỡng         → ≥ 1
Kết quả        → HIT · mức HIGH
Giới hạn       → Chưa đủ căn cứ khẳng định doanh nghiệp chưa tiếp cận được người quyết định
Việc cần làm    → AE xác minh và cập nhật vai trò trong Bên liên quan
Nguồn          → opportunity.stakeholders tại thời điểm chạy
```

## 2. Mười quy tắc

| Rule | Nguồn | Điều kiện | HIT / WARNING khi | NOT_EVALUABLE khi | Cổng |
|---|---|---|---|---|---|
| OPP-R01 | BR-08 | Mức quan trọng | — (luôn PASSED, cho ra LOW/MEDIUM/HIGH) | Thiếu quy mô nhân sự → ghi giới hạn | AE xác minh |
| OPP-R02 | BR-01 | Người quyết định | 0 DECISION_MAKER → HIT HIGH | — | |
| OPP-R03 | FR-37 | Nhu cầu | Trống → HIT HIGH; chưa xác nhận → WARNING LOW | — | |
| OPP-R04 | FR-40 | Đối thủ | Có đối thủ → WARNING MEDIUM | Chưa ghi và chưa xác nhận "không có" | |
| OPP-R05 | BR-15 | Email nhận trong `email_window_days` | Có lịch sử email nhưng 0 email nhận trong cửa sổ → HIT MEDIUM | Chưa có email nào được đồng bộ | |
| OPP-R06 | BR-28 | Ngày chốt | Còn < `opp_close_warning_days` (21) mà vẫn Develop → HIT HIGH | Chưa có ngày chốt | |
| OPP-R07 | FR-35 | Ngân sách | Doanh thu dự kiến > ngân sách → HIT MEDIUM | Chưa có ngân sách | |
| OPP-R08 | FR-41 | Giải pháp | Chưa xác nhận → WARNING MEDIUM | — | |
| OPP-R09 | BR-06 | Cổng QLKD | Mức Cao hoặc còn rủi ro mở / rủi ro mới → WARNING | — | QLKD rà soát (HG6) |
| OPP-R10 | BR-07 | Cổng chuyên môn | Có tích hợp hoặc ≥ `expert_review_min_amount` → WARNING | Cổng tắt → NOT_APPLICABLE | Rà soát chuyên môn |

Mọi ngưỡng đọc từ bảng `settings` (`src/lib/settings-defaults.ts`); không hard-code. Lỗi cũ "mock dùng 150 triệu, BR-08 ghi 100 triệu" đã hết vì mock gọi chính rule engine.

## 3. Trạng thái là taxonomy đóng

| Trạng thái | Ý nghĩa | Dashboard hiển thị |
|---|---|---|
| `PASSED` | Đạt | Xanh |
| `WARNING` | Cần chú ý, chưa phải rủi ro | Vàng |
| `HIT` | Vi phạm → tạo rủi ro có `rule_id` | Đỏ |
| `NOT_EVALUABLE` | Thiếu dữ liệu, **không kết luận thay** | Xám, nêu dữ liệu cần bổ sung |
| `NOT_APPLICABLE` | Quy tắc tắt / không áp dụng | Xám nhạt |

## 4. Độ bao phủ dữ liệu ≠ "AI đúng bao nhiêu %"

```text
confidence = số quy tắc đánh giá được / số quy tắc áp dụng
HIGH ≥ 0,8 · MEDIUM ≥ ai_min_confidence (0,6) · LOW còn lại → gắn cờ "cần bổ sung dữ liệu"
```

Đây là chất lượng dữ liệu đầu vào của bộ quy tắc, không phải xác suất mô hình nói đúng. Tách riêng với mức quan trọng.

## 5. Ai sở hữu phần nào

| Phần | Chủ sở hữu | LLM được làm |
|---|---|---|
| Ngưỡng, trạng thái, mức độ, cổng duyệt | Backend (`rules.ts`) | Không |
| Mức quan trọng chính thức | OPP-R01 | Đề xuất; nếu khác → lưu `llm_importance`, ghi audit "overridden" |
| 3 hành động ưu tiên | Backend xếp: HIT trước, rồi HIGH > MEDIUM > LOW | Thêm hành động bổ sung (vào `additional_actions`) |
| Rủi ro không có quy tắc | — | Được ghi, đánh dấu **"Chưa phân loại (LLM)"**, phải có nguồn |
| Diễn giải, tóm tắt, insight 6 mục | LLM | Có, kèm nguồn được kiểm |
| Quyết định cuối | AE (HG4), QLKD (HG6) | Không |

## 6. Truy vết phiên bản bộ quy tắc

Mỗi bản nghiên cứu lưu `ruleset_version` (`opp-rules-v1`) và `ruleset_hash` = SHA-256 của danh mục quy tắc + giá trị tham số lúc chạy. Admin đổi ngưỡng BR-08 → hash đổi → biết bản nghiên cứu cũ được tạo theo tham số cũ.

## 7. Qualification Agent

Đã có kiểm soát server-side: BANT 0–25 mỗi tiêu chí, tổng do server tính (BR-01), confidence < 0,6 hoặc dữ liệu mâu thuẫn → ép `NEED_INFO`, mọi đề xuất phải có ≥ 1 căn cứ hợp lệ. Chưa có bảng `ai_rule_evaluations` riêng cho Qualification — xem mục "Việc còn mở" ở whitepaper 07.
