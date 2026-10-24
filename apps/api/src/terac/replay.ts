import type { CreateOpportunityBody, FeasibilityBody, FeasibilityRequest, Opportunity, Submission } from "./types";

// TERAC_MODE=replay: respuestas con la misma forma que la API real, sin red.
// El estado va codificado en el id para que funcione en funciones sin estado (Vercel).
// Sustituir los valores por los de una ejecución real grabada cuando la tengamos.

const PREFIX = "replay_";
const PRICING_DELAY_MS = 20_000; // la cotización "tarda" 20 s para que se vea el estado quoting
const RECORDED_CPI = "84.00";
const RECORDED_TIMELINE_HOURS = 120;

const now = () => new Date().toISOString();

export const replay = {
  owns: (id: string) => id.startsWith(PREFIX),

  requestFeasibility(body: FeasibilityBody): FeasibilityRequest {
    return {
      id: `${PREFIX}fr_${Date.now()}`,
      status: "RECEIVED",
      costPerParticipant: null,
      payRateFrequency: null,
      timelineHours: body.timelineHours ?? null,
      submissionCount: body.submissionCount ?? 1,
      respondedAt: null,
      createdAt: now(),
    };
  },

  getFeasibility(id: string): FeasibilityRequest {
    const createdMs = Number(id.split("_").pop()) || 0;
    const priced = Date.now() - createdMs >= PRICING_DELAY_MS;
    return {
      id,
      status: priced ? "RESPONDED" : "RECEIVED",
      costPerParticipant: priced ? RECORDED_CPI : null,
      payRateFrequency: priced ? "ONE_TIME" : null,
      timelineHours: RECORDED_TIMELINE_HOURS,
      submissionCount: 1,
      respondedAt: priced ? now() : null,
      createdAt: new Date(createdMs).toISOString(),
    };
  },

  findOpportunity(_internalTitle: string): Opportunity | undefined {
    return undefined;
  },

  createOpportunity(body: CreateOpportunityBody): Opportunity {
    return { id: `${PREFIX}opp_${Date.now()}`, title: body.title, internal_title: body.internal_title, status: "draft" };
  },

  launchOpportunity(id: string): Opportunity {
    return { id, title: "", status: "active" };
  },

  getSubmission(id: string): Submission {
    return {
      id,
      opportunity_id: `${PREFIX}opp`,
      status: "awaiting_review",
      participant_name: "Alex R.",
      participant_background: {
        experiences: [
          { company: "Agencia de marketing en Miami", role: "Estratega de contenido bilingüe" },
          { company: "Cadena de clínicas en Florida", role: "Responsable de redes sociales" },
        ],
      },
      tasks: [{ sequence: 1, task_type: "interview", status: "completed" }],
    };
  },
};
