import { useQuery } from "@tanstack/react-query";
import type { ActivityEvent, ProfessionalSummary, ProjectTask } from "@bc/shared";
import { api, type Project, type ChatMessage, type Quote } from "./api";
import { useSession } from "./session";

export type TeamMember = { id: string; project_id?: string; status: string;
  participant_summary: ProfessionalSummary | null;
  client_decision: string | null; content_version?: number; reviewed_version?: number;
  has_delivery?: boolean; updated_at?: string; created_at?: string };
export type Workspace = { projects: Project[]; tasks: ProjectTask[]; professionals: TeamMember[];
  activity: ActivityEvent[]; messages: ChatMessage[]; mode: string };
export type ProjectWorkspace = { project: Project; tasks: ProjectTask[]; activity: ActivityEvent[];
  professionals: TeamMember[]; messages: ChatMessage[]; quote: Quote | null;
  progress: { total: number; completed: number; percent: number };
  payment: { status: string; amount_usd: number; is_demo: boolean } | null;
  matching: { requested: boolean; status: string | null; external_id: string | null; mode: string } };
export const closedStatuses = new Set(["delivered", "failed", "refunded"]);
export const approvalStatuses = new Set(["brief_ready", "quoted", "awaiting_payment", "in_review"]);
export function useWorkspace() {
  const token = useSession(s => s.token);
  return useQuery({ queryKey: ["workspace", token], enabled: Boolean(token),
    queryFn: () => api<Workspace>("/v1/workspace"), refetchInterval: 15_000 });
}
export function useProjectWorkspace(id: string) {
  return useQuery({ queryKey: ["workspace-project", id], enabled: Boolean(id),
    queryFn: () => api<ProjectWorkspace>(`/v1/projects/${id}/workspace`), refetchInterval: 10_000 });
}
