import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submissions: vi.fn(), opportunities: vi.fn(), getProject: vi.fn(), transition: vi.fn(),
  getSubmission: vi.fn(), review: vi.fn(), store: vi.fn(), update: vi.fn(), insert: vi.fn(), transaction: vi.fn(),
}));
vi.mock("../db/client", async (original) => ({ ...await original<typeof import("../db/client")>(), db: () => ({
  query: { submissions: { findFirst: mocks.submissions }, teracOpportunities: { findFirst: mocks.opportunities } },
  update: mocks.update, insert: mocks.insert, transaction: mocks.transaction,
}) }));
vi.mock("../agent/review", () => ({ reviewSubmission: mocks.review }));
vi.mock("../lib/storage", () => ({ storeTextDelivery: mocks.store }));
vi.mock("../terac/client", () => ({ terac: { getSubmission: mocks.getSubmission } }));
vi.mock("./projects", () => ({ getProject: mocks.getProject, transition: mocks.transition }));
vi.mock("../env", () => ({ env: () => ({ REVIEW_MODEL: "test-review" }) }));

import { receiveDelivery, reviewPendingSubmission, syncSubmission } from "./submissions";

const review = { meets_brief: true, criteria: [{ criterion: "Natural English", met: true, note: "OK" }],
  cultural_changes_explained: "Se adaptó el tono al público local.", issues: [] };
const sub = { id: "sub1", opportunity_id: "opp1", terac_submission_id: "external1", status: "awaiting_review",
  delivery_text: "Adapted campaign and cultural notes.", delivery_asset_id: "file1", content_version: 2, reviewed_version: 1,
  client_decision: null };
const project = { id: "p1", user_id: "u1", status: "in_review", source_language: "es", brief: { goal: "Audience" } };
const returned: unknown[][] = [];
const inserted: unknown[] = [];
function updateChain() {
  const chain = { set: vi.fn(() => chain), where: vi.fn(() => chain), returning: vi.fn(async () => returned.shift() ?? []) };
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks(); returned.length = 0; inserted.length = 0;
  mocks.submissions.mockResolvedValue(sub); mocks.opportunities.mockResolvedValue({ id: "opp1", project_id: "p1" });
  mocks.getProject.mockResolvedValue(project); mocks.review.mockResolvedValue(review);
  mocks.update.mockImplementation(updateChain);
  mocks.insert.mockImplementation(() => ({ values: (values: unknown) => { inserted.push(values); return Promise.resolve(); } }));
  mocks.transaction.mockImplementation((fn) => fn({ update: mocks.update, insert: mocks.insert }));
});

describe("revisión de entregas", () => {
  it("revisa el contenido real y publica tarjeta y archivo en la misma transacción", async () => {
    returned.push([sub], [sub]);
    await reviewPendingSubmission(sub.id);
    expect(mocks.review).toHaveBeenCalledWith({ brief: project.brief, clientLanguage: "es",
      deliverables: [{ type: "text", text: sub.delivery_text }] });
    expect(inserted[0]).toMatchObject({ project_id: "p1", user_id: "u1", asset_ids: ["file1"],
      card: { type: "delivery", submission_id: "sub1", review } });
  });
  it("no evalúa archivos ausentes ni inventa una revisión", async () => {
    mocks.submissions.mockResolvedValue({ ...sub, delivery_text: null });
    await reviewPendingSubmission(sub.id);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it("no repite una versión revisada ni una revisión en curso", async () => {
    mocks.submissions.mockResolvedValueOnce({ ...sub, reviewed_version: 2 });
    await reviewPendingSubmission(sub.id);
    await reviewPendingSubmission(sub.id); // claim devuelve cero filas (otro worker)
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it("descarta el resultado si llegó otra versión mientras la IA trabajaba", async () => {
    returned.push([sub], []);
    await reviewPendingSubmission(sub.id);
    expect(mocks.review).toHaveBeenCalledOnce();
    expect(inserted).toEqual([]);
  });
  it("libera la revisión fallida para permitir reintento y no publica tarjeta", async () => {
    returned.push([sub]); mocks.review.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(reviewPendingSubmission(sub.id)).rejects.toThrow("provider unavailable");
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(inserted).toEqual([]);
  });
});

describe("pertenencia y orden de eventos", () => {
  it("usa el estado conservado en BD si una lectura antigua de Terac llega tarde", async () => {
    mocks.getSubmission.mockResolvedValue({ id: "external1", status: "in_progress", participant_name: null, opportunity_id: "opp1" });
    mocks.insert.mockReturnValueOnce({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [sub] }) }) });
    returned.push([sub], [sub]);
    await syncSubmission("external1");
    expect(mocks.review).toHaveBeenCalledOnce();
    expect(inserted[0]).toMatchObject({ card: { type: "delivery" } });
  });
  it("no permite guardar una entrega en un proyecto distinto al de Terac", async () => {
    mocks.getSubmission.mockResolvedValue({ opportunity_id: "other" });
    mocks.opportunities.mockResolvedValue(undefined);
    await expect(receiveDelivery("p1", "external1", "Texto adaptado para un público local")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.store).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("acepta awaiting_review aunque no se haya recibido in_progress", async () => {
    mocks.getSubmission.mockResolvedValue({ id: "external1", status: "awaiting_review", participant_name: null, opportunity_id: "opp1" });
    mocks.getProject.mockResolvedValueOnce({ ...project, status: "recruiting" }).mockResolvedValue(project);
    mocks.transition.mockResolvedValue({ ...project, status: "in_progress" });
    mocks.insert.mockReturnValueOnce({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [sub] }) }) });
    await syncSubmission("external1");
    expect(mocks.transition.mock.calls.slice(0, 2)).toEqual([["p1", "recruiting", "in_progress"], ["p1", "in_progress", "in_review"]]);
  });
});
