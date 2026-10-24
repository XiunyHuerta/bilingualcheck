import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enabled: true, project: vi.fn(), payment: vi.fn(), opportunity: vi.fn(),
  submission: vi.fn(), values: vi.fn(), update: vi.fn(), transaction: vi.fn() }));
vi.mock("./demo-payments", () => ({ demoPaymentsEnabled: () => mocks.enabled,
  isDemoPayment: (payment: { whop_payment_id?: string } | undefined) => payment?.whop_payment_id?.startsWith("demo_payment_") }));
vi.mock("../db/client", async original => ({ ...await original<typeof import("../db/client")>(), db: () => ({ transaction: mocks.transaction }) }));
import { startDemoWork } from "./demo-work";

beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled = true;
  mocks.project.mockResolvedValue([{ id: "p", user_id: "u", status: "paid", brief_confirmed: true, brief: { professional_profile: "Copywriting" } }]);
  mocks.payment.mockResolvedValue({ whop_payment_id: "demo_payment_p" });
  mocks.opportunity.mockResolvedValue(undefined); mocks.submission.mockResolvedValue(undefined);
  mocks.values.mockReturnValue({ returning: async () => [{ id: "example", terac_opportunity_id: "replay_demo_p" }] });
  mocks.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
  mocks.transaction.mockImplementation(fn => fn({
    select: () => ({ from: () => ({ where: () => ({ for: mocks.project }) }) }),
    query: { payments: { findFirst: mocks.payment }, teracOpportunities: { findFirst: mocks.opportunity }, submissions: { findFirst: mocks.submission } },
    insert: () => ({ values: mocks.values }), update: mocks.update,
  }));
});

describe("the jury demo assignment", () => {
  it("assigns a clearly fictional professional after a demo payment, without a live contract", async () => {
    await startDemoWork("p", "u");
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ project_id: "p", terac_opportunity_id: "replay_demo_p" }));
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress",
      participant_summary: expect.objectContaining({ name: "Alex Rivera · Demo", specialty: "Copywriting" }) }));
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
  it("rejects an unavailable demo and another owner's project", async () => {
    mocks.enabled = false;
    await expect(startDemoWork("p", "u")).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.enabled = true; mocks.project.mockResolvedValue([]);
    await expect(startDemoWork("p", "other")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("cannot start without a simulated payment and confirmed brief", async () => {
    mocks.payment.mockResolvedValue({ whop_payment_id: "real_payment" });
    await expect(startDemoWork("p", "u")).rejects.toMatchObject({ code: "INVALID_STATE" });
    mocks.payment.mockResolvedValue({ whop_payment_id: "demo_payment_p" });
    mocks.project.mockResolvedValue([{ status: "paid", brief_confirmed: false, brief: {} }]);
    await expect(startDemoWork("p", "u")).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(mocks.values).not.toHaveBeenCalled();
  });
  it("reuses an assignment on retry and never changes completed work", async () => {
    mocks.project.mockResolvedValue([{ status: "delivered", brief_confirmed: true, brief: {} }]);
    mocks.opportunity.mockResolvedValue({ id: "o", terac_opportunity_id: "replay_demo_p" });
    mocks.submission.mockResolvedValue({ id: "s" });
    await expect(startDemoWork("p", "u")).resolves.toEqual({ id: "s" });
    expect(mocks.values).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("never overwrites a live Terac opportunity", async () => {
    mocks.opportunity.mockResolvedValue({ id: "o", terac_opportunity_id: "live_123" });
    await expect(startDemoWork("p", "u")).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
