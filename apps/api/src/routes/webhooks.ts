import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { runAgentTurn } from "../agent/run";
import { db, schema } from "../db/client";
import { required } from "../env";
import { runInBackground } from "../lib/background";
import { getProject, transition } from "../services/projects";
import { terac } from "../terac/client";
import { verifyTeracSignature } from "../terac/webhook";
import { verifyWhopWebhook, type WhopWebhook } from "../whop/client";

export const webhookRoutes = new Hono();

/** Guarda el evento; devuelve false si ya lo habíamos recibido (idempotencia). */
async function recordEvent(provider: "whop" | "terac", eventId: string, payload: unknown) {
  const rows = await db()
    .insert(schema.webhookEvents)
    .values({ provider, event_id: eventId, payload })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.event_id });
  return rows.length > 0;
}

const markProcessed = (provider: "whop" | "terac", eventId: string) =>
  db()
    .update(schema.webhookEvents)
    .set({ processed_at: new Date() })
    .where(and(eq(schema.webhookEvents.provider, provider), eq(schema.webhookEvents.event_id, eventId)));

// ── Whop ──────────────────────────────────────────────────────────

webhookRoutes.post("/webhooks/whop", async (c) => {
  const raw = await c.req.text();
  let verified: ReturnType<typeof verifyWhopWebhook>;
  try {
    verified = verifyWhopWebhook(raw, Object.fromEntries(c.req.raw.headers));
  } catch {
    return c.text("bad signature", 401);
  }
  const { eventId, event } = verified;
  if (!(await recordEvent("whop", eventId || event.data.id, event))) return c.text("duplicate", 200);
  runInBackground("whop", async () => {
    await handleWhopEvent(event);
    await markProcessed("whop", eventId || event.data.id);
  });
  return c.text("ok", 200);
});

async function handleWhopEvent(event: WhopWebhook) {
  const payment = event.data;
  const projectId = typeof payment.metadata?.project_id === "string" ? payment.metadata.project_id : undefined;
  // Respaldo: mapear por el checkout o la variante guardados al crear el pago.
  const row = await db().query.payments.findFirst({
    where: projectId
      ? and(eq(schema.payments.project_id, projectId), eq(schema.payments.status, "pending"))
      : payment.checkout_configuration_id
        ? eq(schema.payments.whop_checkout_id, payment.checkout_configuration_id)
        : eq(schema.payments.whop_variant_id, payment.plan_id ?? "__none__"),
  });
  if (!row) return console.warn("[whop] pago sin proyecto asociado", payment.id);

  if (event.type === "payment.succeeded") {
    const amount = payment.usd_total ?? payment.total;
    if (amount == null || Math.abs(amount - row.amount_usd) > 0.01) {
      return console.error(`[whop] importe ${amount} no coincide con la cotización ${row.amount_usd} (pago ${payment.id})`);
    }
    await db()
      .update(schema.payments)
      .set({ status: "succeeded", whop_payment_id: payment.id, updated_at: new Date() })
      .where(eq(schema.payments.id, row.id));
    await db().update(schema.quotes).set({ status: "accepted" }).where(eq(schema.quotes.id, row.quote_id));
    await transition(row.project_id, "awaiting_payment", "paid");
    await runAgentTurn(row.project_id, { type: "payment_succeeded" });
  } else if (event.type === "payment.failed") {
    await db().update(schema.payments).set({ status: "failed", updated_at: new Date() }).where(eq(schema.payments.id, row.id));
    await transition(row.project_id, "awaiting_payment", "quoted");
  }
}

// ── Terac ─────────────────────────────────────────────────────────

const TeracEvent = z
  .object({
    type: z.string().optional(),
    event_type: z.string().optional(),
    data: z.object({ submission_id: z.string().optional(), id: z.string().optional() }).loose().optional(),
    submission_id: z.string().optional(),
  })
  .loose();

webhookRoutes.post("/webhooks/terac", async (c) => {
  const raw = await c.req.text();
  const check = verifyTeracSignature({
    timestamp: c.req.header("X-Terac-Request-Timestamp"),
    signature: c.req.header("X-Terac-Request-Signature"),
    rawBody: raw,
    secret: required("TERAC_WEBHOOK_SECRET"),
  });
  if (check.ok === false) return c.text(check.reason, check.reason === "stale" ? 400 : 401);

  const event = TeracEvent.parse(JSON.parse(raw));
  const eventId = c.req.header("X-Event-ID") ?? crypto.randomUUID();
  if (!(await recordEvent("terac", eventId, event))) return c.text("duplicate", 200);
  // Responder 2xx en < 10 s y procesar después (doc 04).
  runInBackground("terac", async () => {
    const submissionId = event.data?.submission_id ?? event.submission_id ?? event.data?.id;
    if (submissionId) await syncSubmission(submissionId);
    await markProcessed("terac", eventId);
  });
  return c.text("ok", 200);
});

/** Lee la entrega en Terac y mueve el proyecto según la tabla del doc 04. */
async function syncSubmission(teracSubmissionId: string) {
  const sub = await terac.getSubmission(teracSubmissionId);
  const opportunity = await db().query.teracOpportunities.findFirst({
    where: eq(schema.teracOpportunities.terac_opportunity_id, sub.opportunity_id),
  });
  if (!opportunity) return console.warn("[terac] entrega de una oportunidad desconocida", sub.opportunity_id);

  const summary = {
    name: sub.participant_name,
    experience: (sub.participant_background?.experiences ?? []).slice(0, 3).map((e) => [e.role, e.company].filter(Boolean).join(" · ")),
  };
  const [row] = await db()
    .insert(schema.submissions)
    .values({ opportunity_id: opportunity.id, terac_submission_id: sub.id, status: sub.status, participant_summary: summary })
    .onConflictDoUpdate({ target: schema.submissions.terac_submission_id, set: { status: sub.status, updated_at: new Date() } })
    .returning();

  const project = await getProject(opportunity.project_id);
  if (sub.status === "in_progress" && project.status === "recruiting") {
    await transition(project.id, "recruiting", "in_progress");
  } else if (sub.status === "awaiting_review" && (project.status === "in_progress" || project.status === "revision")) {
    // La revisión con Opus y la tarjeta de entrega se completan en la fase 5.
    await transition(project.id, project.status, "in_review");
    await runAgentTurn(project.id, { type: "submission_received", submissionId: row!.id });
  }
}
