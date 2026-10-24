import type { ApiError, Brief, Card, ProjectStatus, SubmissionReview } from "@bc/shared";
import { config } from "./config";
import { useSession } from "./session";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.error.message ?? `HTTP ${status}`);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useSession.getState().token;
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    await useSession.getState().signOut();
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, json);
  return json as T;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

// ── Tipos de respuesta (doc 07) ─────────────────────────────────

export type User = { id: string; name: string | null; email: string | null; ui_language: string; business_name: string | null };

export type Project = {
  id: string;
  status: ProjectStatus;
  source_language: string;
  target_language: string | null;
  brief: Brief | null;
  brief_confirmed: boolean;
  agent_busy: boolean;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  project_id: string;
  role: "user" | "assistant" | "system_event";
  content: string;
  card: Card | null;
  created_at: string;
  pending?: boolean;
};

export type Quote = { id: string; status: string; total_usd: number | null; eta_days: number | null };
export type Submission = {
  id: string;
  status: string;
  participant_summary: { name: string | null; experience: string[] } | null;
  ai_review: SubmissionReview | null;
};

export type ProjectDetail = { project: Project; quote: Quote | null; submissions: Submission[] };
