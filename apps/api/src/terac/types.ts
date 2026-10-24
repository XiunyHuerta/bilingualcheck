import { z } from "zod";

// Formas validadas contra vendor/terac/openapi.json (API v2 en beta).
// `.loose()` para no romper si Terac añade campos.

export const FeasibilityRequest = z
  .object({
    id: z.string(),
    status: z.enum(["RECEIVED", "RESPONDED", "WON", "LOST", "NOT_PURSUED"]),
    costPerParticipant: z.string().nullable(),
    payRateFrequency: z.enum(["ONE_TIME", "HOURLY", "PER_TASK"]).nullable(),
    timelineHours: z.number().int().nullable(),
    submissionCount: z.number().int().nullable(),
    respondedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .loose();
export type FeasibilityRequest = z.infer<typeof FeasibilityRequest>;

export const FeasibilityBody = z.object({
  taskDescription: z.string().min(1).max(10_000),
  panelDescription: z.string().min(1).max(10_000),
  submissionCount: z.number().int().positive().optional(),
  timelineHours: z.number().int().positive().optional(),
  payRateFrequency: z.enum(["ONE_TIME", "HOURLY", "PER_TASK"]).optional(),
  loiMinutes: z.number().int().positive().optional(),
});
export type FeasibilityBody = z.infer<typeof FeasibilityBody>;

export const OPPORTUNITY_STATUSES = [
  "draft",
  "pre_recruiting",
  "active",
  "fulfilled",
  "paused",
  "stopped",
  "completed",
  "expired",
  "cancelled",
  "failed",
] as const;

export const Opportunity = z
  .object({
    id: z.string(),
    title: z.string(),
    internal_title: z.string().nullable().optional(),
    // Un estado desconocido se trata como "no acepta llamadas" (doc 04).
    status: z.string(),
  })
  .loose();
export type Opportunity = z.infer<typeof Opportunity>;

export const SUBMISSION_STATUSES = [
  "screen_passed",
  "screened_out",
  "in_progress",
  "awaiting_review",
  "approved",
  "rejected",
  "abandoned",
] as const;

export const Submission = z
  .object({
    id: z.string(),
    opportunity_id: z.string(),
    status: z.enum(SUBMISSION_STATUSES),
    participant_name: z.string().nullable(),
    participant_background: z
      .object({
        experiences: z.array(z.object({ company: z.string(), role: z.string().nullable() }).loose()),
      })
      .loose()
      .nullable(),
    tasks: z.array(z.object({ sequence: z.number(), task_type: z.string(), status: z.string() }).loose()),
  })
  .loose();
export type Submission = z.infer<typeof Submission>;

export type CreateOpportunityBody = {
  project_id: string;
  title: string;
  internal_title?: string;
  description?: string;
  num_participants: number;
  business_type: "b2b" | "b2c";
  customer_screening_review?: "auto_invite" | "manual_review";
  expected_days_to_complete?: number;
  feasibility_request_id?: string;
  filters?: Record<string, Record<string, number | string | string[]>>[];
  unrestricted_audience?: boolean;
  screening_questions?: { text: string; pick: "one" | "any" | "boolean" | "text" }[];
  tasks: {
    sequence: number;
    task_type: "interview" | "file_upload" | "activity";
    review_type: "auto_approve" | "manual_review" | "self_report";
    title?: string;
    task_url?: string;
    duration_minutes?: number;
    instructions?: string;
    accepted_mime_types?: string[];
    max_files?: number;
  }[];
};

export const Filter = z.object({ slug: z.string() }).loose();

export const Project = z.object({ id: z.string(), name: z.string(), slug: z.string(), dashboard_url: z.string() }).loose();
export type Project = z.infer<typeof Project>;

export const ProjectPage = z
  .object({
    data: z.array(Project),
    pagination: z.object({ next_cursor: z.string().nullable(), has_more: z.boolean() }).loose(),
  })
  .loose();
export type ProjectPage = z.infer<typeof ProjectPage>;

// GET /organizations/current/context: quién es la organización de la API key.
export const OrganizationContext = z
  .object({
    organizationId: z.string(),
    organizationName: z.string(),
    balanceDollars: z.number(),
    dashboard: z.object({ api_keys: z.string(), finance: z.string() }).loose(),
  })
  .loose();
export type OrganizationContext = z.infer<typeof OrganizationContext>;
