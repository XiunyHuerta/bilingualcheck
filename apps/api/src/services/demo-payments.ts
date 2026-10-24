import { assertTransition } from "@bc/shared";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { env } from "../env";
import { ApiError } from "../lib/errors";
import { requireStatus } from "./projects";

const PREFIX = "demo_payment_";
export const isDemoPayment = (payment: { whop_payment_id: string | null } | null | undefined) =>
  Boolean(payment?.whop_payment_id?.startsWith(PREFIX));

export const demoPaymentsEnabled = () => env().DEMO_PAYMENTS_ENABLED && env().TERAC_MODE === "replay";

/** Un pago simulado nunca financia contrataciones al cambiar Terac a live. */
export function assertPaymentCanFundWork(payment: { whop_payment_id: string | null }) {
  if (isDemoPayment(payment) && env().TERAC_MODE !== "replay") {
    throw new ApiError("INVALID_STATE", "Un pago demo solo permite trabajo simulado");
  }
}

export async function simulatePayment(projectId: string, userId: string) {
  if (!demoPaymentsEnabled()) throw new ApiError("INVALID_STATE", "El pago demo no está disponible");
  return db().transaction(async (tx) => {
    // El bloqueo serializa doble clic y reintentos, y se comprueba la propiedad dentro de la transacción.
    const [project] = await tx.select().from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.user_id, userId))).for("update");
    if (!project) throw new ApiError("NOT_FOUND", "Proyecto no encontrado");
    const existing = await tx.query.payments.findFirst({
      where: and(eq(schema.payments.project_id, projectId), eq(schema.payments.whop_payment_id, `${PREFIX}${projectId}`)),
    });
    if (existing) return { demo: true, reused: true, resume: project.status === "paid" };
    requireStatus(project.status, ["quoted", "awaiting_payment"], "simular el pago");
    const quote = await tx.query.quotes.findFirst({
      where: and(eq(schema.quotes.project_id, projectId), eq(schema.quotes.status, "priced")),
      orderBy: desc(schema.quotes.created_at),
    });
    if (!quote?.total_usd || !quote.terac_feasibility_request_id.startsWith("replay_")) {
      throw new ApiError("INVALID_STATE", "El pago demo requiere una cotización simulada con precio");
    }
    // Las dos transiciones se confirman juntas; no se crea ni altera un pago real de Whop.
    if (project.status === "quoted") assertTransition("quoted", "awaiting_payment");
    assertTransition("awaiting_payment", "paid");
    await tx.insert(schema.payments).values({ project_id: projectId, quote_id: quote.id,
      whop_payment_id: `${PREFIX}${projectId}`, status: "succeeded", amount_usd: quote.total_usd });
    await tx.update(schema.quotes).set({ status: "accepted", updated_at: new Date() }).where(eq(schema.quotes.id, quote.id));
    await tx.update(schema.projects).set({ status: "paid", updated_at: new Date() }).where(eq(schema.projects.id, projectId));
    await tx.insert(schema.messages).values({ project_id: projectId, user_id: userId, role: "system_event",
      content: "demo_payment_succeeded", language: project.source_language });
    return { demo: true, reused: false, resume: true };
  });
}
