import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ findSubmission: vi.fn(), approve: vi.fn(), reject: vi.fn(), transaction: vi.fn() }));
vi.mock("../db/client", async (original) => ({ ...await original<typeof import("../db/client")>(), db: () => ({
  query: { teracOpportunities: { findFirst: async () => ({ id: "owned-opportunity" }) }, submissions: { findFirst: mocks.findSubmission } },
  transaction: mocks.transaction,
}) }));
vi.mock("../services/projects", () => ({ getOwnedProject: async () => ({ id: "owned-project", user_id: "owner", status: "in_review" }),
  requireStatus: () => undefined, transition: vi.fn(), addMessage: vi.fn() }));
vi.mock("../lib/session", () => ({ requireSession: async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => {
  c.set("userId", "owner"); await next();
} }));
vi.mock("../terac/client", () => ({ terac: { approveSubmission: mocks.approve, rejectSubmission: mocks.reject } }));
vi.mock("../agent/run", () => ({ runAgentTurn: vi.fn() }));
vi.mock("../services/submissions", () => ({ reviewPendingSubmission: vi.fn() }));
vi.mock("./cron", () => ({ pollQuotes: vi.fn() }));
import { projectRoutes } from "./projects";
import { ApiError } from "../lib/errors";

const app = new Hono().route("/v1", projectRoutes);
app.onError((error, c) => c.json({ error: error.message }, error instanceof ApiError ? error.status : 500));
const decide = (input: unknown) => app.request("/v1/projects/owned-project/submissions/other-submission/decision", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
});
beforeEach(() => { vi.clearAllMocks(); });

describe("decisiones sobre entregas", () => {
  it("una sesión válida no puede aprobar la entrega de otro proyecto", async () => {
    mocks.findSubmission.mockImplementation(async ({ where }) => {
      const query = new PgDialect().sqlToQuery(where);
      // La entrega existe, pero pertenece a otra oportunidad.
      return query.params.includes("owned-opportunity") ? undefined : { id: "other-submission", ai_review: {} };
    });
    expect((await decide({ decision: "approve" })).status).toBe(404);
    expect(mocks.approve).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rechaza aprobación antes de tener revisión de la versión actual", async () => {
    mocks.findSubmission.mockResolvedValue({ id: "s", ai_review: {}, client_decision: null, content_version: 2, reviewed_version: 1 });
    expect((await decide({ decision: "approve" })).status).toBe(409);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it("pedir cambios exige feedback y no rechaza ni paga en Terac", async () => {
    mocks.findSubmission.mockResolvedValue({ id: "s", ai_review: {}, client_decision: null, content_version: 1, reviewed_version: 1 });
    expect((await decide({ decision: "request_changes", feedback: " " })).status).toBe(400);
    expect(mocks.approve).not.toHaveBeenCalled(); expect(mocks.reject).not.toHaveBeenCalled();
  });
});
