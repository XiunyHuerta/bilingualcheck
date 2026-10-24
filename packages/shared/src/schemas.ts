import { z } from "zod";
import { isValidLanguageTag } from "./language";
import { PROJECT_STATUSES } from "./status";

export const LanguageTag = z.string().min(2).refine(isValidLanguageTag, "Código BCP-47 inválido");

export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);

export const DeliverableType = z.enum(["campaign_adaptation", "web_copy", "web_dev", "design", "other"]);

// Esquema del brief (doc 03). Es lo que el agente guarda con save_brief.
export const BriefSchema = z.object({
  business: z.object({
    name: z.string().min(1),
    sector: z.string().min(1),
    offer: z.string().min(1),
    website: z.string().url().optional(),
  }),
  goal: z.string().min(1),
  source_language: LanguageTag,
  target_language: LanguageTag,
  target_market: z.object({
    city: z.string().optional(),
    region: z.string().optional(),
    country: z.string().min(2),
  }),
  audience: z.string().min(1),
  cultural_notes: z.array(z.string()).default([]),
  deliverable_type: DeliverableType,
  deliverables: z.array(z.string()).min(1),
  acceptance_criteria: z.array(z.string()).min(1),
  asset_ids: z.array(z.string()).default([]),
  deadline_days: z.number().int().positive().optional(),
  budget_usd: z.number().positive().optional(),
  professional_profile: z.string().min(1),
});
export type Brief = z.infer<typeof BriefSchema>;

export const SubmissionReviewSchema = z.object({
  meets_brief: z.boolean(),
  criteria: z.array(z.object({ criterion: z.string(), met: z.boolean(), note: z.string() })),
  cultural_changes_explained: z.string(),
  issues: z.array(z.string()),
  suggested_revision_request: z.string().optional(),
});
export type SubmissionReview = z.infer<typeof SubmissionReviewSchema>;

// Tarjetas interactivas que acompañan a un mensaje (doc 06).
export const CardSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quick_replies"), options: z.array(z.string()).min(1).max(6) }),
  z.object({ type: z.literal("brief"), brief: BriefSchema }),
  z.object({
    type: z.literal("quote"),
    quote_id: z.string(),
    total_usd: z.number(),
    eta_days: z.number().int().nullable(),
    includes: z.array(z.string()),
  }),
  z.object({ type: z.literal("delivery"), submission_id: z.string(), review: SubmissionReviewSchema }),
  z.object({ type: z.literal("recommendation"), text: z.string() }),
]);
export type Card = z.infer<typeof CardSchema>;

// ── Cuerpos de la API /v1 (doc 07) ──────────────────────────────

export const AuthWhopBody = z.object({
  code: z.string().min(1),
  code_verifier: z.string().min(43),
  redirect_uri: z.string().min(1),
});

export const PatchMeBody = z
  .object({ ui_language: LanguageTag, business_name: z.string().min(1).max(200) })
  .partial();

export const CreateProjectBody = z.object({
  source_language: LanguageTag,
  target_language: LanguageTag.optional(),
});

export const PostMessageBody = z.object({
  content: z.string().min(1).max(8000),
  asset_ids: z.array(z.string().uuid()).max(10).optional(),
});

export const CreateAssetBody = z.object({
  filename: z.string().min(1).max(255),
  mime_type: z.string().min(3).max(127),
});

export const DecisionBody = z.object({
  decision: z.enum(["approve", "request_changes"]),
  feedback: z.string().max(4000).optional(),
});

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "NOT_FOUND",
  "INVALID_STATE",
  "VALIDATION_ERROR",
  "UPSTREAM_TERAC",
  "UPSTREAM_WHOP",
  "RATE_LIMITED",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export type ApiError = { error: { code: ErrorCode; message: string; details?: unknown } };
