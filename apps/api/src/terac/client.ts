import { z } from "zod";
import { teracApiKey, teracEnv } from "../env";
import { ApiError } from "../lib/errors";
import { replay } from "./replay";
import {
  type CreateOpportunityBody,
  type FeasibilityBody,
  FeasibilityRequest,
  Filter,
  Opportunity,
  OrganizationContext,
  Project,
  ProjectPage,
  Submission,
} from "./types";

// Cliente REST de Terac v2. Todo el acceso a Terac pasa por aquí (doc 04):
// auth por API key, reintento respetando Retry-After y validación con zod.

const MAX_ATTEMPTS = 3;

async function call<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const url = `${teracEnv().TERAC_BASE_URL}${path}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${teracApiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const wait = Number(res.headers.get("Retry-After") ?? "61");
      await new Promise((r) => setTimeout(r, Math.min(wait, 90) * 1000));
      continue;
    }

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = json.error ?? json;
      if (res.status === 429) throw new ApiError("RATE_LIMITED", "Terac limitó las peticiones", err);
      throw new ApiError("UPSTREAM_TERAC", `Terac ${method} ${path} → ${res.status}: ${err.message ?? text}`, {
        status: res.status,
        code: err.code,
        issues: err.issues,
      });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError("UPSTREAM_TERAC", `Respuesta inesperada de Terac en ${path}`, parsed.error.issues);
    }
    return parsed.data;
  }
}

const isReplay = () => teracEnv().TERAC_MODE === "replay";
const listOf = <T extends z.ZodType>(item: T) =>
  z.union([z.array(item), z.object({ data: z.array(item) }).loose().transform((r) => r.data)]);
const anyJson = z.unknown();

export const terac = {
  /** Quién es la organización de la API key: nombre, saldo y enlaces del panel. */
  async organizationContext() {
    return call("GET", "/organizations/current/context", OrganizationContext);
  },

  async getProject(id: string): Promise<Project> {
    return call("GET", `/projects/${encodeURIComponent(id)}`, Project);
  },

  async findProjectByName(name: string): Promise<Project | undefined> {
    let cursor: string | null = null;
    do {
      const query: string = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page: ProjectPage = await call("GET", `/projects${query}`, ProjectPage);
      const hit = page.data.find((p) => p.name === name);
      if (hit) return hit;
      cursor = page.pagination.has_more ? page.pagination.next_cursor : null;
    } while (cursor);
    return undefined;
  },

  /** Cada llamada crea un proyecto nuevo aunque el nombre exista: buscar antes con `findProjectByName`. */
  async createProject(name: string): Promise<Project> {
    return call("POST", "/projects", Project, { name });
  },

  async requestFeasibility(body: FeasibilityBody): Promise<FeasibilityRequest> {
    if (isReplay()) return replay.requestFeasibility(body);
    // Demo: reutilizar una cotización real ya respondida (doc 04 · Modo demo).
    const demoId = teracEnv().TERAC_DEMO_FEASIBILITY_REQUEST_ID;
    if (demoId) return this.getFeasibility(demoId);
    return call("POST", "/feasibility/requests", FeasibilityRequest, body);
  },

  async getFeasibility(id: string): Promise<FeasibilityRequest> {
    if (isReplay() || replay.owns(id)) return replay.getFeasibility(id);
    return call("GET", `/feasibility/requests/${encodeURIComponent(id)}`, FeasibilityRequest);
  },

  async listFilters() {
    return call("GET", "/filters", listOf(Filter));
  },

  async filterOptions(slug: string) {
    return call("GET", `/filters/${encodeURIComponent(slug)}/options`, anyJson);
  },

  async findOpportunityByInternalTitle(internalTitle: string): Promise<Opportunity | undefined> {
    if (isReplay()) return replay.findOpportunity(internalTitle);
    const list = await call("GET", "/opportunities", listOf(Opportunity));
    return list.find((o) => o.internal_title === internalTitle);
  },

  async createOpportunity(body: CreateOpportunityBody): Promise<Opportunity> {
    if (isReplay()) return replay.createOpportunity(body);
    return call("POST", "/opportunities", Opportunity, body);
  },

  async launchOpportunity(id: string): Promise<Opportunity> {
    if (isReplay()) return replay.launchOpportunity(id);
    return call("POST", `/opportunities/${encodeURIComponent(id)}/launch`, Opportunity, {});
  },

  async getSubmission(id: string): Promise<Submission> {
    if (isReplay()) return replay.getSubmission(id);
    return call("GET", `/submissions/${encodeURIComponent(id)}`, Submission);
  },

  async approveSubmission(id: string) {
    if (isReplay()) return { id, status: "approved" };
    return call("POST", `/submissions/${encodeURIComponent(id)}/approve`, anyJson, {});
  },

  async rejectSubmission(
    id: string,
    reason: string,
    category: "low_quality" | "failed_instructions" | "incomplete" | "other" = "other",
  ) {
    if (isReplay()) return { id, status: "rejected" };
    return call("POST", `/submissions/${encodeURIComponent(id)}/reject`, anyJson, {
      rejection_category: category,
      rejection_reason: reason,
    });
  },

  /** Solo en una organización sandbox: simula un profesional y dispara webhooks reales. */
  async createTestSubmission(opportunityId: string) {
    return call("POST", `/opportunities/${encodeURIComponent(opportunityId)}/test-submissions`, anyJson, {});
  },

  hooks: {
    create: (targetUrl: string) =>
      call("POST", "/hooks/subscriptions", z.object({ id: z.string() }).loose(), {
        target_url: targetUrl,
        event_types: ["submission.status.change", "submission.approved"],
      }),
    confirm: (id: string) => call("POST", `/hooks/subscriptions/${id}`, anyJson, {}),
    secret: (id: string) => call("GET", `/hooks/subscriptions/${id}/secret`, anyJson),
    list: () => call("GET", "/hooks/subscriptions", anyJson),
  },
};
