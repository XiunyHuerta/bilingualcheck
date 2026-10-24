import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { runAgentTurn } from "../agent/run";
import { db, schema } from "../db/client";
import { ConfigError, required } from "../env";
import { runInBackground } from "../lib/background";
import { getProject, transition } from "../services/projects";
import { syncSubmission } from "../services/submissions";
import { claimWebhookEvent, processWebhookEvent, recoverWebhookEvents, type WebhookHandlers } from "../services/webhook-events";
import { verifyTeracSignature } from "../terac/webhook";
import { verifyWhopWebhook, WhopWebhook } from "../whop/client";

export const webhookRoutes = new Hono();

// ── Whop ──────────────────────────────────────────────────────────

webhookRoutes.post("/webhooks/whop", async (c) => {
  const raw = await c.req.text();
  let verified: ReturnType<typeof verifyWhopWebhook>;
  try {
    verified = verifyWhopWebhook(raw, Object.fromEntries(c.req.raw.headers));
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    return c.text("bad signature", 401);
  }
  const { event } = verified;
  // Un mismo pago puede emitir failed y succeeded: su ID no identifica el evento.
  const eventId = verified.eventId || event.id || `${event.type}:${event.data.id}`;
  const claim = await claimWebhookEvent("whop", eventId, event);
  if (!claim) return c.text("duplicate", 200);
  runInBackground("whop", () => processWebhookEvent(claim, handlers.whop));
  return c.text("ok", 200);
});

async function handleWhopEvent(event: WhopWebhook) {
  if (event.type !== "payment.succeeded" && event.type !== "payment.failed") return;
  const payment = event.data;
  const projectId = typeof payment.metadata?.project_id === "string" ? payment.metadata.project_id : undefined;
  const quoteId = typeof payment.metadata?.quote_id === "string" ? payment.metadata.quote_id : undefined;
  // La metadata solo añade restricciones: nunca selecciona otro pago pendiente del proyecto.
  const identity = payment.checkout_configuration_id
    ? eq(schema.payments.whop_checkout_id, payment.checkout_configuration_id)
    : payment.plan_id
      ? eq(schema.payments.whop_variant_id, payment.plan_id)
      : eq(schema.payments.whop_payment_id, payment.id);
  const rows = await db().query.payments.findMany({
    where: and(identity,
      projectId ? eq(schema.payments.project_id, projectId) : undefined,
      quoteId ? eq(schema.payments.quote_id, quoteId) : undefined),
    limit: 2,
  });
  if (rows.length !== 1) throw new Error(`[whop] pago ${payment.id} sin checkout/plan asociado de forma inequívoca`);
  const row = rows[0]!;
  if (row.whop_payment_id && row.whop_payment_id !== payment.id) {
    throw new Error(`[whop] checkout de ${payment.id} ya asociado a otro pago`);
  }

  if (event.type === "payment.succeeded") {
    const amount = payment.usd_total ?? payment.total;
    if (amount == null || !Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(row.amount_usd * 100)) {
      throw new Error(`[whop] importe ${amount} no coincide con la cotización ${row.amount_usd} (pago ${payment.id})`);
    }
    if (row.status === "refunded") return;
    await db().update(schema.payments)
      .set({ status: "succeeded", whop_payment_id: payment.id, updated_at: new Date() })
      .where(eq(schema.payments.id, row.id));
    const quote = await db().query.quotes.findFirst({ where: eq(schema.quotes.id, row.quote_id) });
    if (!quote || quote.status === "unavailable") {
      console.warn(`[whop] pago ${payment.id} recibido para una cotización sustituida; requiere revisión, sin contratación automática`);
      return;
    }
    await db().update(schema.quotes).set({ status: "accepted" }).where(eq(schema.quotes.id, row.quote_id));
    const project = await getProject(row.project_id);
    if (project.status === "awaiting_payment") {
      await transition(row.project_id, "awaiting_payment", "paid");
    } else if (["recruiting", "in_progress", "in_review", "revision", "delivered", "refunded"].includes(project.status)) {
      return; // Un intento anterior ya confirmó el pago y avanzó el proyecto.
    } else if (project.status !== "paid") {
      throw new Error(`[whop] proyecto ${row.project_id} no puede confirmar el pago en ${project.status}`);
    }
    // Si falló tras la transición, reintentar desde paid sin repetirla.
    await runAgentTurn(row.project_id, { type: "payment_succeeded" });
  } else {
    if (row.status === "succeeded" || row.status === "refunded") return;
    const changed = await db().update(schema.payments).set({ status: "failed", updated_at: new Date() })
      .where(and(eq(schema.payments.id, row.id), eq(schema.payments.status, row.status)))
      .returning({ id: schema.payments.id });
    if (!changed.length) return; // Un succeeded concurrente ganó el cambio de estado.
    const project = await getProject(row.project_id);
    if (project.status === "awaiting_payment") await transition(row.project_id, "awaiting_payment", "quoted");
  }
}

// ── Terac ─────────────────────────────────────────────────────────

const TeracEvent = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  event_type: z.string().optional(),
  data: z.object({ submission_id: z.string().optional(), id: z.string().optional() }).loose().optional(),
  submission_id: z.string().optional(),
}).loose();

webhookRoutes.post("/webhooks/terac", async (c) => {
  const raw = await c.req.text();
  const check = verifyTeracSignature({
    timestamp: c.req.header("X-Terac-Request-Timestamp"),
    signature: c.req.header("X-Terac-Request-Signature"),
    rawBody: raw,
    secret: required("TERAC_WEBHOOK_SECRET"),
  });
  if (check.ok === false) return c.text(check.reason, check.reason === "stale" ? 400 : 401);

  let event: z.infer<typeof TeracEvent>;
  try {
    event = TeracEvent.parse(JSON.parse(raw));
  } catch {
    return c.text("bad payload", 400);
  }
  const eventId = c.req.header("X-Event-ID") || event.id || `sha256:${createHash("sha256").update(raw).digest("hex")}`;
  const claim = await claimWebhookEvent("terac", eventId, event);
  if (!claim) return c.text("duplicate", 200);
  runInBackground("terac", () => processWebhookEvent(claim, handlers.terac));
  return c.text("ok", 200);
});

const handlers: WebhookHandlers = {
  whop: (payload) => handleWhopEvent(WhopWebhook.parse(payload)),
  terac: async (payload) => {
    const event = TeracEvent.parse(payload);
    const eventType = event.type ?? event.event_type ?? "";
    const isSubmissionEvent = /^submission(?:[._:]|$)/i.test(eventType);
    const submissionId = event.data?.submission_id ?? event.submission_id ?? (isSubmissionEvent ? event.data?.id : undefined);
    if (submissionId) await syncSubmission(submissionId);
  },
};

/** El cron vuelve a ejecutar eventos pendientes aunque el proveedor ya haya recibido 200. */
export const recoverPendingWebhooks = () => recoverWebhookEvents(handlers);
