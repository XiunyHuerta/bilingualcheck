import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Brief, Card, ProjectStatus, SubmissionReview } from "@bc/shared";

// Modelo de datos del doc 07. El estado del proyecto solo lo cambia el servidor.

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const usd = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  whop_user_id: text("whop_user_id").notNull().unique(),
  email: text("email"),
  name: text("name"),
  ui_language: text("ui_language").notNull().default("es"),
  business_name: text("business_name"),
  created_at: createdAt(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<ProjectStatus>().notNull().default("intake"),
    source_language: text("source_language").notNull(),
    target_language: text("target_language"),
    target_market: jsonb("target_market").$type<Brief["target_market"]>(),
    brief: jsonb("brief").$type<Brief>(),
    brief_confirmed: boolean("brief_confirmed").notNull().default(false),
    agent_busy: boolean("agent_busy").notNull().default(false),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("projects_user_idx").on(t.user_id)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Se duplica user_id para que la política RLS de Realtime sea un simple filtro.
    user_id: uuid("user_id").notNull(),
    role: text("role").$type<"user" | "assistant" | "system_event">().notNull(),
    content: text("content").notNull(),
    card: jsonb("card").$type<Card>(),
    language: text("language"),
    asset_ids: jsonb("asset_ids").$type<string[]>(),
    created_at: createdAt(),
  },
  (t) => [index("messages_project_idx").on(t.project_id, t.created_at)],
);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  project_id: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"client_upload" | "deliverable">().notNull(),
  storage_path: text("storage_path").notNull(),
  filename: text("filename").notNull(),
  mime_type: text("mime_type").notNull(),
  source_url: text("source_url"),
  uploaded: boolean("uploaded").notNull().default(false),
  created_at: createdAt(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  project_id: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  terac_feasibility_request_id: text("terac_feasibility_request_id").notNull(),
  status: text("status").$type<"requested" | "priced" | "unavailable" | "accepted">().notNull(),
  terac_cost_usd: usd("terac_cost_usd"),
  fee_usd: usd("fee_usd"),
  total_usd: usd("total_usd"),
  eta_days: integer("eta_days"),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  project_id: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  quote_id: uuid("quote_id")
    .notNull()
    .references(() => quotes.id),
  whop_checkout_id: text("whop_checkout_id"),
  whop_variant_id: text("whop_variant_id"),
  whop_payment_id: text("whop_payment_id").unique(),
  status: text("status").$type<"pending" | "succeeded" | "failed" | "refunded">().notNull(),
  amount_usd: usd("amount_usd").notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const teracOpportunities = pgTable("terac_opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  project_id: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  terac_opportunity_id: text("terac_opportunity_id").notNull().unique(),
  status: text("status").notNull(),
  created_at: createdAt(),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunity_id: uuid("opportunity_id")
    .notNull()
    .references(() => teracOpportunities.id, { onDelete: "cascade" }),
  terac_submission_id: text("terac_submission_id").notNull().unique(),
  status: text("status").notNull(),
  // Solo nombre y experiencia resumida: nunca email ni LinkedIn del profesional.
  participant_summary: jsonb("participant_summary").$type<{ name: string | null; experience: string[] }>(),
  ai_review: jsonb("ai_review").$type<SubmissionReview>(),
  client_decision: text("client_decision").$type<"approved" | "changes_requested">(),
  client_feedback: text("client_feedback"),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  project_id: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(),
  model: text("model").notNull(),
  tool_calls: jsonb("tool_calls").$type<{ name: string; input: unknown; result: unknown; ok: boolean }[]>(),
  input_tokens: integer("input_tokens"),
  output_tokens: integer("output_tokens"),
  error: text("error"),
  created_at: createdAt(),
});

export const webhookEvents = pgTable(
  "webhook_events",
  {
    provider: text("provider").$type<"whop" | "terac">().notNull(),
    event_id: text("event_id").notNull(),
    payload: jsonb("payload").notNull(),
    processed_at: timestamp("processed_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.event_id] })],
);

// Idempotencia de herramientas con efectos: (project_id, tool, hash(args)).
export const toolInvocations = pgTable(
  "tool_invocations",
  {
    project_id: uuid("project_id").notNull(),
    tool: text("tool").notNull(),
    args_hash: text("args_hash").notNull(),
    result: jsonb("result"),
    created_at: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.project_id, t.tool, t.args_hash] })],
);

export type Project = typeof projects.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type User = typeof users.$inferSelect;
