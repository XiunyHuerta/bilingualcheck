import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: { DEMO_PAYMENTS_ENABLED: true, TERAC_MODE: "replay" },
  project: vi.fn(), payment: vi.fn(), quote: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn(),
}));
vi.mock("../env", () => ({ env: () => mocks.settings }));
vi.mock("../db/client", async (original) => ({ ...await original<typeof import("../db/client")>(),
  db: () => ({ transaction: mocks.transaction }) }));

import { assertPaymentCanFundWork, demoPaymentsEnabled, isDemoPayment, simulatePayment } from "./demo-payments";

const updates: unknown[] = [];
beforeEach(() => {
  vi.clearAllMocks(); updates.length = 0;
  Object.assign(mocks.settings, { DEMO_PAYMENTS_ENABLED: true, TERAC_MODE: "replay" });
  mocks.project.mockResolvedValue([{ id: "p", user_id: "u", status: "awaiting_payment", source_language: "es" }]);
  mocks.payment.mockResolvedValue(undefined);
  mocks.quote.mockResolvedValue({ id: "q", total_usd: 105, terac_feasibility_request_id: "replay_fr_123" });
  mocks.update.mockImplementation(() => ({ set: (values: unknown) => { updates.push(values); return { where: async () => undefined }; } }));
  mocks.transaction.mockImplementation((fn) => fn({
    select: () => ({ from: () => ({ where: () => ({ for: mocks.project }) }) }),
    query: { payments: { findFirst: mocks.payment }, quotes: { findFirst: mocks.quote } },
    insert: () => ({ values: mocks.insert }), update: mocks.update,
  }));
});

describe("pagos demo", () => {
  it.each(["quoted", "awaiting_payment"])("avanza desde %s y conserva marca demo sin identidad Whop", async (status) => {
    mocks.project.mockResolvedValue([{ id: "p", user_id: "u", status, source_language: "es" }]);
    await expect(simulatePayment("p", "u")).resolves.toMatchObject({ demo: true, reused: false, resume: true });
    expect(mocks.insert.mock.calls[0]![0]).toEqual({ project_id: "p", quote_id: "q", whop_payment_id: "demo_payment_p",
      status: "succeeded", amount_usd: 105 });
    expect(updates).toEqual([expect.objectContaining({ status: "accepted" }), expect.objectContaining({ status: "paid" })]);
    expect(mocks.insert).toHaveBeenLastCalledWith(expect.objectContaining({ content: "demo_payment_succeeded" }));
  });
  it("rechaza peticiones cuando está desactivado o Terac es live", async () => {
    mocks.settings.DEMO_PAYMENTS_ENABLED = false;
    expect(demoPaymentsEnabled()).toBe(false);
    await expect(simulatePayment("p", "u")).rejects.toMatchObject({ code: "INVALID_STATE" });
    mocks.settings.DEMO_PAYMENTS_ENABLED = true; mocks.settings.TERAC_MODE = "live";
    await expect(simulatePayment("p", "u")).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("comprueba propietario y serializa la operación con un bloqueo", async () => {
    mocks.project.mockResolvedValue([]);
    await expect(simulatePayment("p", "other")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.project).toHaveBeenCalledWith("update");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("no permite saltarse el brief ni una cotización real o sin precio", async () => {
    mocks.project.mockResolvedValueOnce([{ id: "p", status: "intake" }]);
    await expect(simulatePayment("p", "u")).rejects.toMatchObject({ code: "INVALID_STATE" });
    for (const quote of [undefined, { total_usd: 0 }, { total_usd: 105, terac_feasibility_request_id: "real_quote" }]) {
      mocks.quote.mockResolvedValueOnce(quote);
      await expect(simulatePayment("p", "u")).rejects.toMatchObject({ code: "INVALID_STATE" });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("reutiliza un pago simulado al repetir la petición", async () => {
    mocks.payment.mockResolvedValue({ whop_payment_id: "demo_payment_p" });
    mocks.project.mockResolvedValue([{ id: "p", status: "recruiting" }]);
    await expect(simulatePayment("p", "u")).resolves.toEqual({ demo: true, reused: true, resume: false });
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("impide financiar trabajo real con un pago demo, incluso tras cambiar de modo", () => {
    const demo = { whop_payment_id: "demo_payment_p" };
    expect(isDemoPayment(demo)).toBe(true);
    expect(() => assertPaymentCanFundWork(demo)).not.toThrow();
    mocks.settings.TERAC_MODE = "live";
    expect(() => assertPaymentCanFundWork(demo)).toThrow("solo permite trabajo simulado");
    expect(() => assertPaymentCanFundWork({ whop_payment_id: "pay_real" })).not.toThrow();
  });
});
