import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "../env";
import { webhookRoutes, recoverPendingWebhooks } from "./webhooks";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(), process: vi.fn(), recover: vi.fn(), verifyWhop: vi.fn(), verifyTerac: vi.fn(),
  required: vi.fn(), payments: vi.fn(), update: vi.fn(), getProject: vi.fn(), transition: vi.fn(),
  agent: vi.fn(), syncSubmission: vi.fn(), tasks: [] as Array<() => Promise<unknown>>,
}));
vi.mock("../db/client", async () => ({
  schema: await import("../db/schema"),
  db: () => ({ query: { payments: { findMany: mocks.payments } }, update: mocks.update }),
}));
vi.mock("../services/webhook-events", () => ({
  claimWebhookEvent: mocks.claim, processWebhookEvent: mocks.process, recoverWebhookEvents: mocks.recover,
}));
vi.mock("../services/submissions", () => ({ syncSubmission: mocks.syncSubmission }));
vi.mock("../services/projects", () => ({ getProject: mocks.getProject, transition: mocks.transition }));
vi.mock("../agent/run", () => ({ runAgentTurn: mocks.agent }));
vi.mock("../lib/background", () => ({ runInBackground: (_label: string, task: () => Promise<unknown>) => mocks.tasks.push(task) }));
vi.mock("../terac/webhook", () => ({ verifyTeracSignature: mocks.verifyTerac }));
vi.mock("../whop/client", async (original) => ({ ...await original<object>(), verifyWhopWebhook: mocks.verifyWhop }));
vi.mock("../env", async (original) => ({ ...await original<object>(), required: mocks.required }));

describe("rutas de webhook", () => {
  const dialect = new PgDialect();
  const app = new Hono().route("/", webhookRoutes);
  app.onError((error, c) => c.text(error.message, error instanceof ConfigError ? 503 : 500));
  let writes: Array<{ table: unknown; patch: Record<string, unknown> }>;
  const payment = { id: "pay_local", project_id: "project_1", quote_id: "quote_1", amount_usd: 42,
    status: "pending", whop_payment_id: null, whop_checkout_id: "checkout_1", whop_variant_id: "plan_1" };
  const event = () => ({ type: "payment.succeeded", data: { id: "payment_1", checkout_configuration_id: "checkout_1",
    plan_id: "plan_1", usd_total: 42, metadata: { project_id: "project_1", quote_id: "quote_1" } } });
  const whop = () => app.request("/webhooks/whop", { method: "POST", body: "signed-whop-body" });
  const terac = (body: unknown, headers: Record<string, string> = {}) => app.request("/webhooks/terac", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers,
  });
  const finish = () => mocks.tasks.shift()!();

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tasks.length = 0;
    writes = [];
    mocks.required.mockReturnValue("test-webhook-secret");
    mocks.verifyTerac.mockReturnValue({ ok: true });
    mocks.verifyWhop.mockReturnValue({ eventId: "event_whop_1", event: event() });
    mocks.claim.mockImplementation(async (provider, eventId, payload) => ({ provider, eventId, payload, attempts: 1 }));
    mocks.process.mockImplementation(async (claim, handler) => handler(claim.payload));
    mocks.payments.mockResolvedValue([{ ...payment }]);
    mocks.getProject.mockResolvedValue({ id: "project_1", status: "awaiting_payment" });
    mocks.transition.mockResolvedValue({ id: "project_1", status: "paid" });
    mocks.agent.mockResolvedValue(undefined);
    mocks.syncSubmission.mockResolvedValue(undefined);
    mocks.update.mockImplementation((table) => ({ set: (patch: Record<string, unknown>) => {
      writes.push({ table, patch });
      return { where: () => ({ returning: async () => [{ id: "pay_local" }] }) };
    } }));
  });

  it("acepta el pago sin datos de usuario y procesa por checkout/quote específicos", async () => {
    expect((await whop()).status).toBe(200);
    expect(mocks.agent).not.toHaveBeenCalled();
    await finish();
    const where = dialect.sqlToQuery(mocks.payments.mock.calls[0]![0].where);
    expect(where.sql).toContain('"whop_checkout_id"');
    expect(where.sql).not.toContain('"status"');
    expect(where.params).toEqual(["checkout_1", "project_1", "quote_1"]);
    expect(writes.map((write) => write.patch.status)).toEqual(["succeeded", "accepted"]);
    expect(mocks.transition).toHaveBeenCalledExactlyOnceWith("project_1", "awaiting_payment", "paid");
    expect(mocks.agent).toHaveBeenCalledExactlyOnceWith("project_1", { type: "payment_succeeded" });
  });

  it("responde duplicate sin programar trabajo si no hay claim", async () => {
    mocks.claim.mockResolvedValue(null);
    const response = await whop();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("duplicate");
    expect(mocks.tasks).toHaveLength(0);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("usa el plan específico si el proveedor no envía checkout ni metadata", async () => {
    mocks.verifyWhop.mockReturnValue({ eventId: "event_1", event: {
      type: "payment.succeeded", data: { id: "payment_1", plan_id: "plan_1", total: "42.00" },
    } });
    await whop();
    await finish();
    const where = dialect.sqlToQuery(mocks.payments.mock.calls[0]![0].where);
    expect(where.sql).toContain('"whop_variant_id"');
    expect(where.params).toEqual(["plan_1"]);
    expect(mocks.agent).toHaveBeenCalledOnce();
  });

  it("no busca por project_id solamente cuando falta checkout/plan", async () => {
    const value = event();
    mocks.verifyWhop.mockReturnValue({ eventId: "event_1", event: {
      ...value, data: { id: "payment_1", usd_total: 42, metadata: value.data.metadata },
    } });
    mocks.payments.mockResolvedValue([]);
    await whop();
    await expect(finish()).rejects.toThrow("sin checkout/plan");
    const where = dialect.sqlToQuery(mocks.payments.mock.calls[0]![0].where);
    expect(where.sql).toContain('"whop_payment_id"');
    expect(writes).toHaveLength(0);
  });

  it.each([41.99, 42.01, null, "NaN"])("rechaza importe %s y deja que el procesador libere el evento", async (amount) => {
    const value = event();
    mocks.verifyWhop.mockReturnValue({ eventId: "event_1", event: { ...value, data: { ...value.data, usd_total: amount } } });
    await whop();
    await expect(finish()).rejects.toThrow("no coincide");
    expect(writes).toHaveLength(0);
    expect(mocks.agent).not.toHaveBeenCalled();
  });

  it("reanuda tras un fallo posterior a la transición a paid", async () => {
    mocks.agent.mockRejectedValueOnce(new Error("temporary agent failure")).mockResolvedValueOnce(undefined);
    await whop();
    await expect(finish()).rejects.toThrow("temporary agent failure");
    mocks.getProject.mockResolvedValue({ id: "project_1", status: "paid" });
    mocks.payments.mockResolvedValue([{ ...payment, status: "succeeded", whop_payment_id: "payment_1" }]);
    await whop();
    await finish();
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.agent).toHaveBeenCalledTimes(2);
  });

  it("un failed tardío no revierte un pago succeeded", async () => {
    mocks.verifyWhop.mockReturnValue({ eventId: "event_failed", event: { ...event(), type: "payment.failed" } });
    mocks.payments.mockResolvedValue([{ ...payment, status: "succeeded", whop_payment_id: "payment_1" }]);
    await whop();
    await finish();
    expect(writes).toHaveLength(0);
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it("diferencia failed/succeeded del mismo pago cuando no hay webhook-id", async () => {
    mocks.verifyWhop.mockReturnValue({ eventId: "", event: { ...event(), type: "payment.failed" } });
    await whop();
    mocks.verifyWhop.mockReturnValue({ eventId: "", event: event() });
    await whop();
    expect(mocks.claim.mock.calls.map((call) => call[1])).toEqual(["payment.failed:payment_1", "payment.succeeded:payment_1"]);
  });

  it("la falta del secreto de Whop conserva el 503 de ConfigError", async () => {
    mocks.verifyWhop.mockImplementation(() => { throw new ConfigError(["WHOP_WEBHOOK_SECRET"]); });
    expect((await whop()).status).toBe(503);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("una firma Whop inválida devuelve 401 sin persistir", async () => {
    mocks.verifyWhop.mockImplementation(() => { throw new Error("invalid signature"); });
    expect((await whop()).status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("Terac delega la sincronización de submissions al servicio compartido", async () => {
    expect((await terac({ event_type: "submission.status.change", data: { id: "sub_1" } }, { "X-Event-ID": "event_terac" })).status).toBe(200);
    await finish();
    expect(mocks.syncSubmission).toHaveBeenCalledExactlyOnceWith("sub_1");
  });

  it("un ping con data.id no se interpreta como submission", async () => {
    await terac({ type: "ping", data: { id: "ping_1" } });
    await finish();
    expect(mocks.syncSubmission).not.toHaveBeenCalled();
  });

  it("Terac genera un ID determinista para reentregas sin X-Event-ID", async () => {
    const body = { type: "submission.status.change", submission_id: "sub_1" };
    await terac(body);
    await terac(body);
    expect(mocks.claim.mock.calls[0]![1]).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(mocks.claim.mock.calls[1]![1]).toBe(mocks.claim.mock.calls[0]![1]);
  });

  it("Terac rechaza payloads inválidos antes de persistir", async () => {
    expect((await terac("invalid-json")).status).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("la falta de configuración de Terac devuelve 503", async () => {
    mocks.required.mockImplementation(() => { throw new ConfigError(["TERAC_WEBHOOK_SECRET"]); });
    expect((await terac({ type: "ping" })).status).toBe(503);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("el cron recibe ambos handlers para recuperar los payloads persistidos", async () => {
    mocks.recover.mockResolvedValue({ checked: 0, processed: 0, failed: 0, skipped: 0 });
    await recoverPendingWebhooks();
    const handlers = mocks.recover.mock.calls[0]![0];
    await handlers.terac({ submission_id: "sub_recovered" });
    expect(mocks.syncSubmission).toHaveBeenCalledExactlyOnceWith("sub_recovered");
    expect(handlers.whop).toBeTypeOf("function");
  });
});
