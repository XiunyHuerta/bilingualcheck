import { priceQuote } from "@bc/shared";
import { and, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { runAgentTurn } from "../agent/run";
import { db, schema } from "../db/client";
import { env } from "../env";
import { transition } from "../services/projects";
import { terac } from "../terac/client";
import { reviewPendingSubmission } from "../services/submissions";
import { recoverPendingWebhooks } from "./webhooks";

export const cronRoutes = new Hono();

// Hobby: mantenimiento diario. La app abierta también sondea sus cotizaciones.
cronRoutes.get("/cron/poll-quotes", async (c) => {
  const secret = env().CRON_SECRET;
  if (!secret || c.req.header("Authorization") !== `Bearer ${secret}`) return c.text("unauthorized", 401);
  const webhooks = await recoverPendingWebhooks();
  const reviews = await retryReviews();
  return c.json({ ...await pollQuotes(), webhooks, reviews });
});

export async function pollQuotes(projectId?: string) {
  const pending = await db()
    .select({ quote: schema.quotes, project: schema.projects })
    .from(schema.quotes)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.quotes.project_id))
    .where(and(eq(schema.quotes.status, "requested"), eq(schema.projects.status, "quoting"),
      projectId ? eq(schema.projects.id, projectId) : undefined));

  const results: { project_id: string; status: string }[] = [];
  for (const { quote, project } of pending) {
    try {
      // Como máximo una consulta por cotización cada 30 s, incluso con varias pestañas.
      const [claimed] = await db().update(schema.quotes).set({ updated_at: new Date() })
        .where(and(eq(schema.quotes.id, quote.id), eq(schema.quotes.status, "requested"),
          lt(schema.quotes.updated_at, new Date(Date.now() - 30_000)))).returning();
      if (!claimed) continue;
      const fr = await terac.getFeasibility(quote.terac_feasibility_request_id);
      if (fr.status === "RESPONDED" && fr.costPerParticipant) {
        const perParticipant = Number(fr.costPerParticipant);
        if (!Number.isFinite(perParticipant) || perParticipant <= 0) throw new Error("Terac devolvió un precio inválido");
        const price = priceQuote(perParticipant * (fr.submissionCount ?? 1), env().FEE_RATE);
        const cap = Math.min(env().BUDGET_CAP_USD, project.brief?.budget_usd ?? Infinity);
        const [priced] = await db()
          .update(schema.quotes)
          .set({
            status: "priced",
            ...price,
            eta_days: fr.timelineHours ? Math.ceil(fr.timelineHours / 24) : null,
            updated_at: new Date(),
          })
          .where(and(eq(schema.quotes.id, quote.id), eq(schema.quotes.status, "requested"))).returning();
        if (!priced) continue; // El cliente editó el brief mientras respondía Terac.
        if (price.total_usd > cap || price.terac_cost_usd > env().TERAC_SPEND_CAP_USD) {
          // Guardarraíl de presupuesto: no se presenta una cotización por encima del tope.
          await db().update(schema.quotes).set({ status: "unavailable" }).where(eq(schema.quotes.id, quote.id));
          await transition(project.id, "quoting", "failed");
          await runAgentTurn(project.id, { type: "quote_unavailable" });
          results.push({ project_id: project.id, status: "over_budget" });
          continue;
        }
        await transition(project.id, "quoting", "quoted");
        await runAgentTurn(project.id, { type: "quote_ready" });
        results.push({ project_id: project.id, status: "quoted" });
      } else if (fr.status === "LOST" || fr.status === "NOT_PURSUED") {
        await db().update(schema.quotes).set({ status: "unavailable" }).where(eq(schema.quotes.id, quote.id));
        await transition(project.id, "quoting", "failed");
        await runAgentTurn(project.id, { type: "quote_unavailable" });
        results.push({ project_id: project.id, status: "unavailable" });
      } else {
        results.push({ project_id: project.id, status: fr.status });
      }
    } catch (err) {
      console.error(`[cron] cotización ${quote.id}:`, err);
      results.push({ project_id: project.id, status: "error" });
    }
  }
  return { checked: pending.length, results };
}

cronRoutes.get("/cron/review-submissions", async (c) => {
  const secret = env().CRON_SECRET;
  if (!secret || c.req.header("Authorization") !== `Bearer ${secret}`) return c.text("unauthorized", 401);
  return c.json({ results: await retryReviews() });
});

async function retryReviews() {
  const pending = await db().query.submissions.findMany({ where: and(
    eq(schema.submissions.status, "awaiting_review"),
    lt(schema.submissions.reviewed_version, schema.submissions.content_version)), limit: 3 });
  const results: { id: string; ok: boolean }[] = [];
  for (const sub of pending) {
    try { await reviewPendingSubmission(sub.id); results.push({ id: sub.id, ok: true }); }
    catch { results.push({ id: sub.id, ok: false }); }
  }
  return results;
}
