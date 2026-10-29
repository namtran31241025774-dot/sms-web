# 06 · Hỏi đáp bảo vệ kỹ thuật

> Các câu trả lời ngắn cho phần hỏi đáp. Mỗi câu có thể đi tiếp xuống màn hình, bảng dữ liệu hoặc code ở whitepaper 07.

**Đây có phải chatbot hay prompt chaining không?** Không. Mỗi Agent có prompt, danh sách công cụ được cấp quyền, vòng gọi công cụ có giới hạn, schema đầu ra, rule engine và cổng duyệt riêng.

**Ai quyết định mức quan trọng?** Quy tắc OPP-R01 theo BR-08, đọc ngưỡng từ cấu hình. LLM đề xuất khác thì bị thay, giá trị LLM được giữ ở `llm_importance` để đối chiếu.

**"Độ bao phủ 60 %" có phải AI đúng 60 % không?** Không. Là tỷ lệ quy tắc có đủ dữ liệu để đánh giá.

**Không có email trong 30 ngày nghĩa là khách im lặng?** Không. Nếu hồ sơ chưa từng có email đồng bộ, OPP-R05 là *Chưa đánh giá được*. Chỉ khi có lịch sử email mà 30 ngày không có email nhận thì mới là rủi ro.

**3 hành động ưu tiên chọn thế nào?** Backend xếp: quy tắc *Vi phạm* trước, rồi theo mức Cao > Trung bình > Thấp; không còn "3 câu đầu theo thứ tự code".

**Agent có tự thêm đối thủ / rủi ro không?** Không. Chỉ ghi bản nghiên cứu; AE xác minh (HG4) mới chép vào hồ sơ.

**Nguồn `mock://…` là gì?** Dữ liệu mẫu của chế độ mock, không phải tin tức tìm trên Internet.

**OpenAI nằm ở đâu?** `src/lib/llm/openai.ts`, function calling trong `runWithLlm` (DEC-12): chọn bước, gọi công cụ, diễn giải, viết tóm tắt và insight. Không tính ngưỡng, không đặt trạng thái quy tắc, không duyệt.

**Đổi ngưỡng thì bản nghiên cứu cũ thế nào?** Giữ nguyên; `ruleset_hash` cho biết bản đó tạo theo tham số nào.

