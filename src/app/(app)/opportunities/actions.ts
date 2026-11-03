"use server";

import { DOC_FIELDS } from "@/lib/services/document-extract";
import { applyExtraction, applySolutionExtraction, extractDocument, rejectExtraction, removeOpportunityDocument, saveOpportunityDocument,type DocumentKind } from "@/lib/services/documents";
import { agentMode } from "@/lib/agents/runtime";
import { act, id, num, optStr, str } from "@/lib/action";
import { requirePermission } from "@/lib/auth";
import { runAgent } from "@/lib/agents/runtime";
import { DomainError, type ChecklistKey } from "@/lib/domain";
import { addActivity, userActor } from "@/lib/services/core";
import {
  addCompetitor,
  addOpportunityItem,
  addRisk,
  addStakeholder,
  advanceStage,
  confirmScopeDocument,
  createScopeDocument,
  createSolution,
  dismissResearch,
  markLost,
  reopenOpportunity,
  reviewExpertSolution,
  removeCompetitor,
  removeOpportunityItem,
  removeStakeholder,
  setChecklist,
  submitExpertReview,
  updateOpportunity,
  updateOpportunityItem,
  updateRiskStatus,
  updateScopeDocument,
  updateSolution,
  verifyResearch,
} from "@/lib/services/opportunities";
import { createQuoteFromConfiguration } from "@/lib/services/quotes";
import {createDiscoveryAppointment,updateDiscoverySurvey,updateTechnicalSurvey,SURVEY_FIELDS,TECHNICAL_FIELDS} from '@/lib/services/discovery';
import {actOnRuleEvaluation,type RuleAction} from '@/lib/services/research-actions';

export async function saveDiscoverySurveyAction(fd:FormData) {
  const oppId=id(fd);const technical=fd.get('section')==='technical';
  await act(back(oppId),async()=>{
    const u=await requirePermission(technical?'opp.solution':'opp.write');
    const fields=technical?TECHNICAL_FIELDS:SURVEY_FIELDS;
    const input=Object.fromEntries(fields.filter(k=>fd.has(k)).map(k=>[k,str(fd,k)]));
    return technical?updateTechnicalSurvey(userActor(u),oppId,input):updateDiscoverySurvey(userActor(u),oppId,input);
  },'Đã lưu khảo sát');
}
export async function createDiscoveryAppointmentAction(fd:FormData) {
  const oppId=id(fd);
  await act(back(oppId),async()=>{
    const u=await requirePermission('opp.write');
    return createDiscoveryAppointment(userActor(u),oppId,{startsAt:str(fd,'starts_at'),method:str(fd,'meeting_method'),presalesId:id(fd,'presales_id'),contactIds:fd.getAll('contact_id').map(Number),note:optStr(fd,'note') ?? undefined});
  },'Đã hẹn khảo sát và phân công tư vấn');
}
export async function actOnRuleEvaluationAction(fd:FormData) {
  const oppId=id(fd);
  await act(back(oppId,'research'),async()=>{
    const u=await requirePermission('ai.review');
    return actOnRuleEvaluation(userActor(u),id(fd,'evaluation_id'),{action:str(fd,'action') as RuleAction,note:str(fd,'note'),assigneeId:fd.get('assignee_id')?id(fd,'assignee_id'):undefined});
  },'Đã ghi nhận xử lý quy tắc');
}

const back = (oppId: number, tab = "summary") => `/opportunities/${oppId}?tab=${tab}`;

export async function updateOppAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId),
    async () => {
      const u = await requirePermission("opp.write");
      updateOpportunity(userActor(u), oppId, {
        name: str(fd, "name") || undefined,
        amount: fd.get("amount") ? num(fd, "amount") : undefined,
        budget: fd.get("budget") ? num(fd, "budget") : undefined,
        close_date: optStr(fd, "close_date"),
        customer_need: optStr(fd, "customer_need"),
        price_list_id: Number(fd.get("price_list_id")) || null,
        primary_contact_id: Number(fd.get("primary_contact_id")) || null,
        presales_id: Number(fd.get("presales_id")) || null,
        importance: (optStr(fd, "importance") as "LOW" | "MEDIUM" | "HIGH") || null,
      });
    },
    "Đã lưu thông tin Cơ hội",
  );
}

// ===== Biên bản phạm vi (FR-37) =====
export async function scopeDocAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "scope"),
    async () => {
      const u = await requirePermission("opp.write");
      const docId = fd.get("doc_id") ? Number(fd.get("doc_id")) : null;
      const op = optStr(fd, "op");

      if (op === "confirm" && docId) {
        confirmScopeDocument(userActor(u), docId);
        return;
      }

      if (docId) {
        updateScopeDocument(userActor(u), docId, {
          title: str(fd, "title"),
          content: optStr(fd, "content") ?? undefined,
          deliverables: optStr(fd, "deliverables") ?? undefined,
          status: (optStr(fd, "status") as "DRAFT" | "SENT" | "CONFIRMED") || "DRAFT",
        });
      } else {
        createScopeDocument(userActor(u), oppId, {
          title: str(fd, "title"),
          content: optStr(fd, "content") ?? undefined,
          deliverables: optStr(fd, "deliverables") ?? undefined,
        });
      }
    },
    "Đã cập nhật biên bản phạm vi triển khai",
  );
}

// ===== Sản phẩm / Dịch vụ (FR-38) =====
export async function oppItemAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "items"),
    async () => {
      const u = await requirePermission("opp.write");
      const removeId = fd.get("remove") ? Number(fd.get("remove")) : null;
      if (removeId) {
        removeOpportunityItem(userActor(u), removeId);
        return;
      }

      const itemId = fd.get("item_id") ? Number(fd.get("item_id")) : null;
      if (itemId) {
        updateOpportunityItem(userActor(u), itemId, {
          quantity: num(fd, "quantity"),
          unit_price: fd.get("unit_price") ? num(fd, "unit_price") : undefined,
          discount_pct: fd.get("discount_pct") ? Number(fd.get("discount_pct")) : undefined,
          notes: optStr(fd, "notes") ?? undefined,
        });
      } else {
        addOpportunityItem(userActor(u), oppId, {
          product_id: Number(fd.get("product_id")),
          quantity: num(fd, "quantity") || 1,
          unit_price: fd.get("unit_price") ? num(fd, "unit_price") : undefined,
          discount_pct: fd.get("discount_pct") ? Number(fd.get("discount_pct")) : undefined,
          notes: optStr(fd, "notes") ?? undefined,
        });
      }
    },
    "Đã cập nhật cấu hình sản phẩm / giải pháp",
  );
}

// ===== Hồ sơ giải pháp Presales & Duyệt chuyên môn (FR-41, FR-42) =====
export async function solutionAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "solution"),
    async () => {
      const u = await requirePermission("opp.solution");
      const solId = fd.get("solution_id") ? Number(fd.get("solution_id")) : null;
      const title = str(fd, "title");
      const technical_approach = optStr(fd, "technical_approach") ?? undefined;
      const architecture = optStr(fd, "architecture") ?? undefined;
      const estimated_effort_mandays = fd.get("estimated_effort_mandays") ? Number(fd.get("estimated_effort_mandays")) : 0;
      const integration_required = fd.get("integration_required") === "on" || fd.get("integration_required") === "1";
      const risks = optStr(fd, "risks") ?? undefined;

      if (solId) {
        updateSolution(userActor(u), solId, {
          title,
          technical_approach,
          architecture,
          estimated_effort_mandays,
          integration_required,
          risks,
        });
      } else {
        createSolution(userActor(u), oppId, {
          title,
          technical_approach,
          architecture,
          estimated_effort_mandays,
          integration_required,
          risks,
        });
      }
    },
    "Đã lưu hồ sơ phương án kỹ thuật",
  );
}

export async function submitExpertReviewAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "solution"),
    async () => {
      const u = await requirePermission("opp.solution");
      submitExpertReview(userActor(u), oppId);
    },
    "Đã gửi yêu cầu Quản lý kinh doanh duyệt chuyên môn (FR-42)",
  );
}

export async function expertReviewDecisionAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "solution"),
    async () => {
      const u = await requirePermission("opp.expert_review");
      const decision = str(fd, "decision") as "APPROVED" | "REJECTED";
      const note = optStr(fd, "note") ?? undefined;
      reviewExpertSolution(userActor(u), oppId, decision, note);
    },
    "Đã ghi nhận kết quả duyệt chuyên môn",
  );
}

// ===== Checklist (FR-46) =====
export async function checklistAction(fd: FormData) {
  const oppId = id(fd);
  await act(back(oppId), async () => {
    const key = str(fd, "key") as ChecklistKey;
    const u = await requirePermission(key === "solution_confirmed" ? "opp.solution" : "opp.write");
    setChecklist(userActor(u), oppId, key, str(fd, "value") === "1");
  });
}

// ===== Bên liên quan & Đối thủ (FR-39, FR-40) =====
export async function stakeholderAction(fd: FormData) {
  const oppId = id(fd);
  await act(back(oppId, "stakeholders"), async () => {
    const u = await requirePermission("opp.write");
    if (fd.get("remove")) return removeStakeholder(userActor(u), oppId, Number(fd.get("remove")));
    addStakeholder(userActor(u), oppId, {
      name: str(fd, "name"),
      role: str(fd, "role"),
      notes: optStr(fd, "notes") ?? undefined,
      contact_id: fd.get("contact_id") ? Number(fd.get("contact_id")) : undefined,
    });
  });
}

export async function competitorAction(fd: FormData) {
  const oppId = id(fd);
  await act(back(oppId, "stakeholders"), async () => {
    const u = await requirePermission("opp.write");
    if (fd.get("remove")) return removeCompetitor(userActor(u), oppId, Number(fd.get("remove")));
    addCompetitor(userActor(u), oppId, Number(fd.get("competitor_id")), optStr(fd, "notes"));
  });
}

// ===== Rủi ro (FR-43, HG5) =====
export async function riskAction(fd: FormData) {
  const oppId = id(fd);
  await act(back(oppId, "risks"), async () => {
    const u = await requirePermission("opp.write");
    const riskId = fd.get("risk_id") ? Number(fd.get("risk_id")) : null;
    const op = optStr(fd, "op");

    if (riskId && op) {
      if (op === "RESOLVED") {
        updateRiskStatus(userActor(u), oppId, riskId, "RESOLVED", { resolution: str(fd, "resolution") });
        return;
      }
      if (op === "DISMISSED") {
        updateRiskStatus(userActor(u), oppId, riskId, "DISMISSED", { dismiss_reason: str(fd, "dismiss_reason") });
        return;
      }
      if (op === "MITIGATED") {
        updateRiskStatus(userActor(u), oppId, riskId, "MITIGATED");
        return;
      }
      if (op === "OPEN") {
        updateRiskStatus(userActor(u), oppId, riskId, "OPEN");
        return;
      }
    }

    // Tương thích ngược:
    if (fd.get("resolve")) {
      updateRiskStatus(userActor(u), oppId, Number(fd.get("resolve")), "RESOLVED", { resolution: str(fd, "resolution") });
      return;
    }

    addRisk(userActor(u), oppId, {
      description: str(fd, "description"),
      severity: (optStr(fd, "severity") as "LOW" | "MEDIUM" | "HIGH") || "MEDIUM",
    });
  });
}

// ===== Chuyển giai đoạn (FR-45, FR-46) =====
export async function advanceAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId),
    async () => {
      const u = await requirePermission("opp.stage");
      const r = advanceStage(userActor(u), oppId);
      if (!r.moved) throw new DomainError(r.message);
      return r.message;
    },
    (m) => m,
  );
}

// ===== Đóng & Mở lại cơ hội (FR-47, BR-17, BR-27) =====
export async function lostAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId),
    async () => {
      const u = await requirePermission("opp.stage");
      const reason = str(fd, "reason");
      const reasonNote = optStr(fd, "reason_note");
      markLost(userActor(u), oppId, reason, reasonNote ?? undefined);
    },
    "Đã đóng Cơ hội: Thất bại (Lost)",
  );
}

export async function reopenAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId),
    async () => {
      const u = await requirePermission("opp.reopen");
      const reason = str(fd, "reason");
      reopenOpportunity(userActor(u), oppId, reason);
    },
    "Đã mở lại Cơ hội thành công theo BR-17",
  );
}

// ===== AI Opportunity Agent =====
export async function runOppAgentAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "research"),
    async () => {
      const u = await requirePermission("ai.run");
      const r = await runAgent("OPPORTUNITY", { type: "opportunity", id: oppId }, "MANUAL_RUN", u.id);
      if (r.status === "FAILED") throw new DomainError(`Agent lỗi: ${r.summary}`);
      return r.summary;
    },
    (s) => s,
  );
}

export async function verifyResearchAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "research"),
    async () => {
      const u = await requirePermission("ai.review");
      const researchId = id(fd, "research_id");
      if (fd.get("dismiss")) return dismissResearch(userActor(u), researchId);
      verifyResearch(userActor(u), researchId, {
        applyImportance: fd.get("apply_importance") === "on",
        riskIndexes: fd.getAll("risk").map(Number),
      });
    },
    "Đã xử lý nghiên cứu của Agent",
  );
}

export async function addOppActivityAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "activities"),
    async () => {
      const u = await requirePermission("opp.write");
      const type = str(fd, "type") as "NOTE" | "CALL" | "EMAIL" | "MEETING";
      if (!["NOTE", "CALL", "EMAIL", "MEETING"].includes(type)) throw new DomainError("Loại hoạt động không hợp lệ");
      if (!str(fd, "subject")) throw new DomainError("Thiếu tiêu đề");
      addActivity({
        entityType: "opportunity",
        entityId: oppId,
        type,
        subject: str(fd, "subject"),
        body: optStr(fd, "body"),
        direction: type === "EMAIL" ? (str(fd, "direction") as "IN" | "OUT") || "IN" : null,
        createdBy: u.id,
      });
    },
    "Đã ghi nhận hoạt động",
  );
}

export async function createQuoteAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "quotes"),
    async () => {
      const u = await requirePermission("quote.write");
      const quote=createQuoteFromConfiguration(userActor(u),oppId);
      return { redirectTo: `/quotes/${quote.quoteId}?v=${quote.versionId}` };
    },
    "Đã tạo báo giá nháp",
  );
}

export async function uploadDocumentAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "documents"),
    async () => {
      const u = await requirePermission("document.write");
      const file = fd.get("file");
      if (!(file instanceof File) || !file.size) throw new DomainError("Vui lòng chọn tệp");
      saveOpportunityDocument(userActor(u), oppId, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },{kind:(optStr(fd,'document_kind') ?? 'OTHER') as DocumentKind,solutionId:fd.get('solution_id')?id(fd,'solution_id'):undefined});
    },
    "Đã tải tài liệu lên",
  );
}

export async function extractDocumentAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "documents"),
    async () => {
      const u = await requirePermission("document.write");
      const r = await extractDocument(userActor(u), Number(fd.get("document_id")), { useAi: agentMode() === "llm" });
      return r.fields.filter((f) => !f.value).length;
    },
    (missing) => (missing ? `Đã đọc tệp, còn thiếu ${missing} thông tin. Vui lòng kiểm tra.` : "Đã đọc đủ thông tin. Vui lòng kiểm tra."),
  );
}

export async function removeDocumentAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "documents"),
    async () => {
      const u = await requirePermission("document.write");
      removeOpportunityDocument(userActor(u), Number(fd.get("document_id")));
    },
    "Đã xóa tài liệu khỏi cơ hội",
  );
}

const documentValues = (fd: FormData) =>
  Object.fromEntries(DOC_FIELDS.filter((f) => fd.has(`field_${f.key}`)).map((f) => [f.key, String(fd.get(`field_${f.key}`))]));

export async function applyExtractionAction(fd: FormData) {
  const oppId = id(fd);
  const reject = fd.get("op") === "reject";
  await act(
    back(oppId, "documents"),
    async () => {
      const u = await requirePermission("document.write");
      const extractionId = Number(fd.get("extraction_id"));
      if (reject) {
        rejectExtraction(userActor(u), extractionId);
        return "Đã bỏ qua kết quả đọc tệp";
      }
      const items = [...fd.keys()]
        .filter((k) => k.startsWith("item_on_"))
        .map((k) => {
          const productId = Number(k.slice("item_on_".length));
          return { product_id: productId, quantity: Number(fd.get(`item_qty_${productId}`)) };
        });
      const { solution } = applyExtraction(userActor(u), extractionId, documentValues(fd), items);
      return solution === "PENDING"
        ? `Đã cập nhật hồ sơ và thêm ${items.length} sản phẩm. Hồ sơ kỹ thuật đang chờ Chuyên viên tư vấn giải pháp xác nhận.`
        : `Đã cập nhật hồ sơ và thêm ${items.length} sản phẩm.`;
    },
    (message) => message,
  );
}

export async function applySolutionExtractionAction(fd: FormData) {
  const oppId = id(fd);
  await act(
    back(oppId, "solution"),
    async () => {
      const u = await requirePermission("opp.solution");
      const choice=optStr(fd,'solution_choice');
      if(choice && !['SKIP','REPLACE'].includes(choice)) throw new DomainError('Lựa chọn hồ sơ không hợp lệ');
      applySolutionExtraction(userActor(u), Number(fd.get("extraction_id")), documentValues(fd),choice?{action:choice as 'SKIP'|'REPLACE',solutionId:fd.get('solution_id')?id(fd,'solution_id'):undefined}:undefined);
    },
    "Đã tạo hồ sơ kỹ thuật từ tài liệu",
  );
}
