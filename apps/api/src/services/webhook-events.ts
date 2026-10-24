import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "../db/client";

export type WebhookProvider = "whop" | "terac";
export type WebhookHandler = (payload: unknown) => Promise<unknown>;
export type WebhookHandlers = Record<WebhookProvider, WebhookHandler>;

// Mayor que el tiempo máximo de una función; un proceso interrumpido se recupera después.
export const WEBHOOK_LEASE_MS = 10 * 60_000;

const claimColumns = {
  provider: schema.webhookEvents.provider,
  eventId: schema.webhookEvents.event_id,
  payload: schema.webhookEvents.payload,
  attempts: schema.webhookEvents.attempts,
};

export type WebhookClaim = {
  provider: WebhookProvider;
  eventId: string;
  payload: unknown;
  attempts: number;
};

const claimable = () => and(
  isNull(schema.webhookEvents.processed_at),
  or(
    isNull(schema.webhookEvents.processing_at),
    lte(schema.webhookEvents.processing_at, sql`now() - ${WEBHOOK_LEASE_MS} * interval '1 millisecond'`),
  ),
);

const owned = (claim: WebhookClaim) => and(
  eq(schema.webhookEvents.provider, claim.provider),
  eq(schema.webhookEvents.event_id, claim.eventId),
  eq(schema.webhookEvents.attempts, claim.attempts),
  isNull(schema.webhookEvents.processed_at),
  isNotNull(schema.webhookEvents.processing_at),
);

/** Inserta o reclama un evento pendiente en una sola operación atómica de PostgreSQL. */
export async function claimWebhookEvent(provider: WebhookProvider, eventId: string, payload: unknown): Promise<WebhookClaim | null> {
  const [claim] = await db().insert(schema.webhookEvents)
    .values({ provider, event_id: eventId, payload, processing_at: sql`now()`, attempts: 1 })
    .onConflictDoUpdate({
      target: [schema.webhookEvents.provider, schema.webhookEvents.event_id],
      // Conservar el payload original al recibir otra vez el mismo ID.
      set: { processing_at: sql`now()`, attempts: sql`${schema.webhookEvents.attempts} + 1` },
      setWhere: claimable(),
    })
    .returning(claimColumns);
  return claim ?? null;
}

/** Solo el intento propietario del lease puede completar o liberar el evento. */
export async function processWebhookEvent(claim: WebhookClaim, handler: WebhookHandler): Promise<void> {
  try {
    await handler(claim.payload);
    const completed = await db().update(schema.webhookEvents)
      .set({ processed_at: sql`now()`, processing_at: null })
      .where(owned(claim))
      .returning({ eventId: schema.webhookEvents.event_id });
    if (!completed.length) throw new Error(`Lease perdido para ${claim.provider}:${claim.eventId}`);
  } catch (error) {
    try {
      await db().update(schema.webhookEvents).set({ processing_at: null }).where(owned(claim));
    } catch (releaseError) {
      // Si la BD sigue caída, el lease vence y el cron puede volver a reclamarlo.
      console.error(`[webhook:${claim.provider}] no se pudo liberar ${claim.eventId}`, releaseError);
    }
    throw error;
  }
}

/** Recupera también los eventos cuyo proceso murió después de responder 200 al proveedor. */
export async function recoverWebhookEvents(handlers: WebhookHandlers, limit = 25) {
  const pending = await db().select({
    provider: schema.webhookEvents.provider,
    eventId: schema.webhookEvents.event_id,
  }).from(schema.webhookEvents).where(claimable())
    // Los fallos persistentes no deben monopolizar todos los lotes del cron.
    .orderBy(asc(schema.webhookEvents.attempts), asc(schema.webhookEvents.created_at)).limit(limit);
  const result = { checked: pending.length, processed: 0, failed: 0, skipped: 0 };
  for (const event of pending) {
    try {
      const [claim] = await db().update(schema.webhookEvents)
        .set({ processing_at: sql`now()`, attempts: sql`${schema.webhookEvents.attempts} + 1` })
        .where(and(
          eq(schema.webhookEvents.provider, event.provider),
          eq(schema.webhookEvents.event_id, event.eventId),
          claimable(),
        ))
        .returning(claimColumns);
      if (!claim) {
        result.skipped++;
        continue;
      }
      await processWebhookEvent(claim, handlers[claim.provider]);
      result.processed++;
    } catch (error) {
      result.failed++;
      console.error(`[webhook:${event.provider}] reintento ${event.eventId}`, error);
    }
  }
  return result;
}
