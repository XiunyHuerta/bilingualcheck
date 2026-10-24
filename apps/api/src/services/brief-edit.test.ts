import { beforeEach, describe, expect, it, vi } from "vitest";
import { miamiBrief } from "../demo/miami";

const mocks = vi.hoisted(() => ({ project: vi.fn(), payment: vi.fn(), opportunity: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() }));
vi.mock("./demo-payments", () => ({ demoPaymentsEnabled: () => true,
  isDemoPayment: (p: { whop_payment_id?: string } | undefined) => p?.whop_payment_id?.startsWith("demo_payment_") }));
vi.mock("../db/client", async (original) => ({ ...await original<typeof import("../db/client")>(), db: () => ({ transaction: mocks.transaction }) }));
import { editProjectBrief } from "./brief-edit";
const date = new Date("2026-10-24T19:00:00Z");
const project = { id: "p", user_id: "u", brief: miamiBrief, status: "brief_ready", brief_confirmed: false, agent_busy: false, updated_at: date, source_language: "es" };
const input = () => ({ brief: { ...miamiBrief, audience: "Público sueco" }, expected_updated_at: date.toISOString(),
  content: "Público: Público sueco", ui_language: "es" as const });
const updates: Array<Record<string, unknown>> = [];
beforeEach(() => {
  vi.clearAllMocks(); updates.length = 0;
  mocks.project.mockResolvedValue([project]); mocks.payment.mockResolvedValue(undefined); mocks.opportunity.mockResolvedValue(undefined);
  mocks.update.mockImplementation(() => ({ set: (patch: Record<string, unknown>) => { updates.push(patch);
    return { where: () => ({ returning: async () => [{ ...project, ...patch }] }) }; } }));
  mocks.transaction.mockImplementation((fn) => fn({
    select: () => ({ from: () => ({ where: () => ({ for: mocks.project }) }) }),
    query: { payments: { findFirst: mocks.payment }, teracOpportunities: { findFirst: mocks.opportunity } },
    update: mocks.update, insert: () => ({ values: mocks.insert }), delete: () => ({ where: async () => undefined }),
  }));
});
describe("guardado directo del brief", () => {
  it("invalida el precio anterior y publica la nueva tarjeta sin llamar a IA", async () => {
    const result = await editProjectBrief("p", "u", input());
    expect(updates).toEqual([expect.objectContaining({ status: "unavailable" }),
      expect.objectContaining({ status: "brief_ready", brief_confirmed: false, brief: input().brief })]);
    expect(result.project.brief?.audience).toBe("Público sueco");
    expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({ role: "user" }),
      expect.objectContaining({ role: "assistant", card: { type: "brief", brief: input().brief } })]);
  });
  it("no modifica datos con una versión antigua ni con otro propietario", async () => {
    await expect(editProjectBrief("p", "u", { ...input(), expected_updated_at: "2026-01-01T00:00:00Z" })).rejects.toMatchObject({ code: "INVALID_STATE" });
    mocks.project.mockResolvedValue([]);
    await expect(editProjectBrief("p", "other", input())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("bloquea ediciones durante un turno del agente o un trabajo contratado", async () => {
    mocks.project.mockResolvedValueOnce([{ ...project, agent_busy: true }]);
    await expect(editProjectBrief("p", "u", input())).rejects.toMatchObject({ code: "INVALID_STATE" });
    mocks.opportunity.mockResolvedValue({ id: "opp" });
    await expect(editProjectBrief("p", "u", input())).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("mantiene el alcance bloqueado también cuando el pago es de demostración", async () => {
    mocks.project.mockResolvedValue([{ ...project, status: "paid" }]);
    mocks.payment.mockResolvedValue({ whop_payment_id: "demo_payment_p" });
    await expect(editProjectBrief("p", "u", input())).rejects.toMatchObject({ code: "INVALID_STATE", details: { action: "new_project" } });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("no permite reescribir un contrato pagado con dinero real ni inyectar archivos", async () => {
    mocks.project.mockResolvedValueOnce([{ ...project, status: "paid" }]);
    mocks.payment.mockResolvedValue({ whop_payment_id: "pay_real" });
    await expect(editProjectBrief("p", "u", input())).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(editProjectBrief("p", "u", { ...input(), brief: { ...input().brief, asset_ids: ["foreign-file"] } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["quoting", "quoted", "awaiting_payment", "paid", "recruiting", "in_progress", "in_review", "revision", "delivered"])("no convierte una campaña a website cuando el proyecto está en %s", async status => {
    mocks.project.mockResolvedValue([{ ...project, status }]);
    await expect(editProjectBrief("p", "u", { ...input(), brief: { ...input().brief, deliverable_type: "web_dev" } }))
      .rejects.toMatchObject({ code: "INVALID_STATE", details: { action: "new_project" } });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("no reescribe un plan ya confirmado aunque la cotización siga pendiente", async () => {
    mocks.project.mockResolvedValue([{ ...project, brief_confirmed: true }]);
    await expect(editProjectBrief("p", "u", input())).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
