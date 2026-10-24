import { priceQuote } from "@bc/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { runAgentTurn } from "../agent/run";
import { db, schema } from "../db/client";
import { env } from "../env";
import { transition } from "../services/projects";
import { terac } from "../terac/client";

export const cronRoutes = new Hono();

// Vercel Cron (cada minuto): no hay webhook de cotizaciones en Terac,
// así que sondeamos GET /feasibility/requests/{id} (doc 04).
cronRoutes.get("/cron/poll-quotes", async (c) => {
  const secret = env().CRON_SECRET;
  if (secret && c.req.header("Authorization") !== `Bearer ${secret}`) return c.text("unauthorized", 401);
  return c.json(await pollQuotes());
});

export async function pollQuotes() {
  const pending = await db()
    .select({ quote: schema.quotes, project: schema.projects })
    .from(schema.quotes)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.quotes.project_id))
    .where(and(eq(schema.quotes.status, "requested"), eq(schema.projects.status, "quoting")));

  const results: { project_id: string; status: string }[] = [];
  for (const { quote, project } of pending) {
    try {
      const fr = await terac.getFeasibility(quote.terac_feasibility_request_id);
      if (fr.status === "RESPONDED" && fr.costPerParticipant) {
        const perParticipant = Number(fr.costPerParticipant);
        const price = priceQuote(perParticipant * (fr.submissionCount ?? 1), env().FEE_RATE);
        const cap = Math.min(env().BUDGET_CAP_USD, project.brief?.budget_usd ?? Infinity);
        await db()
          .update(schema.quotes)
          .set({
            status: "priced",
            ...price,
            eta_days: fr.timelineHours ? Math.ceil(fr.timelineHours / 24) : null,
            updated_at: new Date(),
          })
          .where(eq(schema.quotes.id, quote.id));
        if (price.total_usd > cap) {
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
