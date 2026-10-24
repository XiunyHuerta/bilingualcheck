import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimWebhookEvent, processWebhookEvent, recoverWebhookEvents, WEBHOOK_LEASE_MS, type WebhookClaim, type WebhookProvider } from "./webhook-events";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db/client", async () => {
  const schema = await import("../db/schema");
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { schema, db: () => drizzle(mocks.query) };
});

type StoredEvent = WebhookClaim & { processingAt: number | null; processedAt: number | null; createdAt: number };

/** Adaptador de BD simulado: ejecuta el SQL real generado por Drizzle sin claves ni PostgreSQL. */
class EventDatabase {
  now = 1_700_000_000_000;
  rows = new Map<string, StoredEvent>();
  failCompletion = false;

  key(provider: unknown, eventId: unknown) { return `${provider}:${eventId}`; }
  available(row: StoredEvent) {
    return row.processedAt === null && (row.processingAt === null || row.processingAt <= this.now - WEBHOOK_LEASE_MS);
  }
  assertClaimCondition(query: string, params: unknown[]) {
    expect(query).toContain('"processed_at" is null');
    expect(query).toContain('"processing_at" is null');
    expect(query).toContain('"processing_at" <= now() -');
    expect(params).toContain(WEBHOOK_LEASE_MS);
  }
  claimRow(row: StoredEvent) { return [row.provider, row.eventId, row.payload, row.attempts]; }

  async execute(query: string, params: unknown[]) {
    if (query.startsWith('insert into "webhook_events"')) {
      this.assertClaimCondition(query, params);
      expect(query).toContain('on conflict ("provider","event_id") do update');
      expect(query).toContain('"attempts" = "webhook_events"."attempts" + 1');
      const [provider, eventId, payload] = params as [WebhookProvider, string, string];
      const key = this.key(provider, eventId);
      let row = this.rows.get(key);
      if (row && !this.available(row)) return { rows: [] };
      if (!row) {
        row = { provider, eventId, payload: JSON.parse(payload), attempts: 0,
          processedAt: null, processingAt: null, createdAt: this.now };
        this.rows.set(key, row);
      }
      row.processingAt = this.now;
      row.attempts++;
      return { rows: [this.claimRow(row)] };
    }
    if (query.startsWith("select ")) {
      this.assertClaimCondition(query, params);
      expect(query).toContain('order by "webhook_events"."attempts" asc');
      const limit = Number(params.at(-1));
      const pending = [...this.rows.values()].filter((row) => this.available(row))
        .sort((a, b) => a.attempts - b.attempts || a.createdAt - b.createdAt).slice(0, limit);
      return { rows: pending.map((row) => [row.provider, row.eventId]) };
    }
    if (query.includes('"attempts" = "webhook_events"."attempts" + 1')) {
      this.assertClaimCondition(query, params);
      const row = this.rows.get(this.key(params[0], params[1]));
      if (!row || !this.available(row)) return { rows: [] };
      row.processingAt = this.now;
      row.attempts++;
      return { rows: [this.claimRow(row)] };
    }
    expect(query).toMatch(/^update "webhook_events"/);
    expect(query).toContain('"attempts" = $');
    expect(query).toContain('"processed_at" is null');
    expect(query).toContain('"processing_at" is not null');
    const [provider, eventId, attempts] = params.slice(-3);
    const row = this.rows.get(this.key(provider, eventId));
    if (!row || row.attempts !== attempts || row.processedAt !== null || row.processingAt === null) return { rows: [] };
    if (query.includes('set "processed_at" = now()')) {
      if (this.failCompletion) {
        this.failCompletion = false;
        throw new Error("database unavailable");
      }
      row.processedAt = this.now;
    }
    row.processingAt = null;
    return { rows: query.includes("returning") ? [[row.eventId]] : [] };
  }
}

describe("persistencia y recuperación de webhooks", () => {
  let database: EventDatabase;
  const payload = { type: "submission.status.change", submission_id: "sub_1" };
  const claim = () => claimWebhookEvent("terac", "event_1", payload);
  const stored = () => database.rows.get("terac:event_1")!;

  beforeEach(() => {
    vi.clearAllMocks();
    database = new EventDatabase();
    mocks.query.mockImplementation((query: string, params: unknown[]) => database.execute(query, params));
  });

  it("marca el éxito y descarta el duplicado ya procesado", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const first = (await claim())!;
    await processWebhookEvent(first, handler);
    expect(handler).toHaveBeenCalledExactlyOnceWith(payload);
    expect(stored()).toMatchObject({ processedAt: database.now, processingAt: null, attempts: 1 });
    expect(await claim()).toBeNull();
  });

  it("libera el lease tras un fallo y reintenta el mismo evento con el payload original", async () => {
    const failure = new Error("Terac unavailable");
    const handler = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    await expect(processWebhookEvent((await claim())!, handler)).rejects.toBe(failure);
    expect(stored()).toMatchObject({ processedAt: null, processingAt: null, attempts: 1 });
    const retry = (await claimWebhookEvent("terac", "event_1", { altered: true }))!;
    expect(retry).toMatchObject({ attempts: 2, payload });
    await processWebhookEvent(retry, handler);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(stored().processedAt).toBe(database.now);
  });

  it("solo concede un claim para entregas concurrentes del mismo evento", async () => {
    const claims = await Promise.all([claim(), claim(), claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(stored().attempts).toBe(1);
  });

  it("el cron recupera un proceso interrumpido cuando vence su lease, sin otra entrega del proveedor", async () => {
    await claim(); // El proceso desaparece antes de ejecutar el callback de background.
    const handlers = { whop: vi.fn(), terac: vi.fn().mockResolvedValue(undefined) };
    expect(await recoverWebhookEvents(handlers)).toEqual({ checked: 0, processed: 0, failed: 0, skipped: 0 });
    database.now += WEBHOOK_LEASE_MS;
    expect(await recoverWebhookEvents(handlers)).toEqual({ checked: 1, processed: 1, failed: 0, skipped: 0 });
    expect(handlers.terac).toHaveBeenCalledExactlyOnceWith(payload);
    expect(stored().attempts).toBe(2);
    expect(stored().processedAt).toBe(database.now);
  });

  it("un worker antiguo no puede completar ni liberar el claim de un worker nuevo", async () => {
    const old = (await claim())!;
    let finish!: () => void;
    const running = processWebhookEvent(old, () => new Promise<void>((resolve) => { finish = resolve; }));
    database.now += WEBHOOK_LEASE_MS + 1;
    const replacement = (await claim())!;
    finish();
    await expect(running).rejects.toThrow("Lease perdido");
    expect(stored()).toMatchObject({ processedAt: null, processingAt: database.now, attempts: 2 });
    await processWebhookEvent(replacement, vi.fn().mockResolvedValue(undefined));
    expect(stored().processedAt).toBe(database.now);
  });

  it("el fallo de un evento no bloquea otros eventos del lote de recuperación", async () => {
    await claim();
    await claimWebhookEvent("whop", "event_2", { type: "payment.succeeded" });
    database.now += WEBHOOK_LEASE_MS + 1;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const handlers = { terac: vi.fn().mockRejectedValue(new Error("retry later")), whop: vi.fn().mockResolvedValue(undefined) };
      expect(await recoverWebhookEvents(handlers)).toEqual({ checked: 2, processed: 1, failed: 1, skipped: 0 });
      expect(stored()).toMatchObject({ processedAt: null, processingAt: null, attempts: 2 });
      expect(handlers.whop).toHaveBeenCalledOnce();
    } finally { errorLog.mockRestore(); }
  });

  it("recupera eventos anteriores al cambio que nunca tuvieron lease", async () => {
    database.rows.set("terac:event_1", { provider: "terac", eventId: "event_1", payload, attempts: 0,
      processedAt: null, processingAt: null, createdAt: database.now - 86_400_000 });
    const handlers = { whop: vi.fn(), terac: vi.fn().mockResolvedValue(undefined) };
    expect(await recoverWebhookEvents(handlers)).toMatchObject({ processed: 1, failed: 0 });
    expect(stored().attempts).toBe(1);
  });

  it("deja reintentable el evento si falla la escritura de processed_at", async () => {
    const first = (await claim())!;
    database.failCompletion = true;
    await expect(processWebhookEvent(first, vi.fn().mockResolvedValue(undefined))).rejects.toThrow();
    expect(stored()).toMatchObject({ processedAt: null, processingAt: null });
    expect(await claim()).toMatchObject({ attempts: 2 });
  });

  it("deduplica por proveedor además de por ID", async () => {
    expect(await claim()).not.toBeNull();
    expect(await claimWebhookEvent("whop", "event_1", { type: "payment.succeeded" })).not.toBeNull();
    expect(database.rows.size).toBe(2);
  });
});
