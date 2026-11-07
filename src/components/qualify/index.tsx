// Thành phần hiển thị và ghi nhận khảo sát sơ bộ nhu cầu khách hàng (FR-30, FR-31)
import { getLeadAssessment } from "@/lib/services/qualification";
import { Card, FormField } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { saveSurveyAction } from "@/app/(app)/leads/actions";

export async function QualificationPanel({ leadId }: { leadId: number }) {
  const assessment = getLeadAssessment(leadId);

  return (
    <Card title="Khảo sát sơ bộ nhu cầu khách hàng">
      <form action={saveSurveyAction} className="space-y-3">
        <input type="hidden" name="lead_id" value={leadId} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Bài toán / Vấn đề nghiệp vụ" className="md:col-span-2">
            <textarea
              name="business_problem"
              defaultValue={assessment?.business_problem ?? ""}
              placeholder="Mô tả bài toán, khó khăn hoặc nhu cầu cần giải quyết..."
              className="textarea !min-h-16"
            />
          </FormField>
          <FormField label="Quy mô người dùng dự kiến">
            <input
              type="number"
              name="user_scale"
              defaultValue={assessment?.user_scale ?? ""}
              placeholder="VD: 50"
              className="input"
            />
          </FormField>
          <FormField label="Phần mềm / Giải pháp hiện tại">
            <input
              name="current_software"
              defaultValue={assessment?.current_software ?? ""}
              placeholder="VD: Excel, MISA, Phần mềm nội bộ..."
              className="input"
            />
          </FormField>
          <FormField label="Ghi chú bổ sung" className="md:col-span-2">
            <input
              name="notes"
              defaultValue={assessment?.notes ?? ""}
              placeholder="Ghi chú khác..."
              className="input"
            />
          </FormField>
        </div>
        <div className="flex justify-end pt-1">
          <SubmitButton icon="save">Lưu thông tin khảo sát</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
