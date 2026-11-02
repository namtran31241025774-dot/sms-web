import { z } from "zod";

export const RefSchema = z.object({
  ref: z.string().min(1).max(300),
  quote: z.string().max(300).optional(),
  detail: z.string().max(300).optional(),
});
export type Ref = z.infer<typeof RefSchema>;

export const InsightItemSchema = z.union([
  z.object({
    text: z.string().min(1).max(1000),
    sources: z.array(RefSchema),
  }),
  z.object({
    status: z.literal("NO_INSIGHT"),
    reason: z.string().min(1).max(500),
  }),
]);
export type InsightItem = z.infer<typeof InsightItemSchema>;

export const BantProposalSchema = z.object({
  budget: z.union([
    z.number().int().min(0).max(25),
    z.object({ score: z.number().int().min(0).max(25), evidence: z.array(RefSchema).optional() }),
  ]),
  authority: z.union([
    z.number().int().min(0).max(25),
    z.object({ score: z.number().int().min(0).max(25), evidence: z.array(RefSchema).optional() }),
  ]),
  need: z.union([
    z.number().int().min(0).max(25),
    z.object({ score: z.number().int().min(0).max(25), evidence: z.array(RefSchema).optional() }),
  ]),
  timeline: z.union([
    z.number().int().min(0).max(25),
    z.object({ score: z.number().int().min(0).max(25), evidence: z.array(RefSchema).optional() }),
  ]),
  timeline_bucket: z.enum(["THIS_MONTH", "END_OF_QUARTER", "NEXT_YEAR", "UNKNOWN"]).optional(),
  total: z.number().int().min(0).max(100).optional(),
  outcome: z.enum(["QUALIFIED", "NEED_INFO", "DISQUALIFY_PROPOSED"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  missing_info: z.array(z.string()).optional(),
  rationale: z.string().max(2000),
  evidence: z.array(RefSchema),
});
export type BantProposal = z.infer<typeof BantProposalSchema>;

export const EmailDraftSchema = z.object({
  to: z.string().email().optional(),
  subject: z.string().min(3).max(200),
  greeting: z.string().max(200).optional(),
  value_proposition: z.string().max(1000).optional(),
  cta: z.string().max(500).optional(),
  body: z.string().min(10).max(4000),
  purpose: z.string().max(200).optional(),
  facts_used: z.array(RefSchema).default([]),
});
export type EmailDraft = z.infer<typeof EmailDraftSchema>;

export const OpportunityRiskCategory = z.enum([
  "MISSING_DECISION_MAKER",
  "DISENGAGED_STAKEHOLDER",
  "DATA_CONFLICT",
  "COMPETITOR",
  "TECH_CONSTRAINT",
  "OVER_BUDGET",
  "MISSING_BUDGET",
  "TIMELINE",
  "OTHER",
]);

export const OpportunityRiskSchema = z.object({
  category: OpportunityRiskCategory.optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  description: z.string().max(500),
  sources: z.array(RefSchema).optional(),
});

export const ActionItemSchema = z.union([
  z.string().max(300),
  z.object({
    action: z.string().min(1).max(300),
    owner_role: z.string().max(100).optional(),
    why: z.string().max(500).optional(),
    evidence_refs: z.array(RefSchema).optional(),
    rule_id: z.string().max(100).nullable().optional(),
  }),
]);

export const OpportunityResearchSchema = z.object({
  importance: z.enum(["LOW", "MEDIUM", "HIGH"]),
  importance_reason: z.string().min(3).max(500).optional(),
  summary: z.string().min(10).max(2000),
  changes_since_last: z.string().nullable().optional(),
  insights: z.object({
    stakeholder: InsightItemSchema.optional(),
    competitor: InsightItemSchema.optional(),
    account_overview: InsightItemSchema.optional(),
    health: InsightItemSchema.optional(),
    pain_need: InsightItemSchema.optional(),
    product: InsightItemSchema.optional(),
    opportunity_info: InsightItemSchema.optional(),
    bant_result: InsightItemSchema.optional(),
    interaction_history: InsightItemSchema.optional(),
    scope_summary: InsightItemSchema.optional(),
    budget_check: InsightItemSchema.optional(),
  }).optional(),
  missing_info: z.array(z.string().min(1).max(500)).max(30).default([]),
  risks: z.array(OpportunityRiskSchema).max(15),
  next_actions: z.array(ActionItemSchema).max(3),
  additional_actions: z.array(ActionItemSchema).optional(),
  email_insight_status: z.enum(["OK", "NO_INSIGHT"]).default("OK"),
  sources: z.array(RefSchema).max(20),
});
export type OpportunityResearch = z.infer<typeof OpportunityResearchSchema>;
