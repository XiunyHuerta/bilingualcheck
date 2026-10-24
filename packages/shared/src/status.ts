// Máquina de estados del proyecto (doc 02). Solo el servidor cambia el estado;
// la app usa esta tabla para decidir qué tarjetas mostrar.

export const PROJECT_STATUSES = [
  "intake",
  "brief_ready",
  "quoting",
  "quoted",
  "awaiting_payment",
  "paid",
  "recruiting",
  "in_progress",
  "in_review",
  "revision",
  "delivered",
  "failed",
  "refunded",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  intake: ["brief_ready"],
  brief_ready: ["intake", "brief_ready", "quoting"],
  quoting: ["quoted", "failed"],
  quoted: ["awaiting_payment"],
  awaiting_payment: ["paid", "quoted"],
  paid: ["recruiting"],
  recruiting: ["in_progress", "refunded"],
  in_progress: ["in_review"],
  in_review: ["revision", "delivered"],
  revision: ["in_review"],
  delivered: [],
  failed: [],
  refunded: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ProjectStatus,
    readonly to: ProjectStatus,
  ) {
    super(`Transición no permitida: ${from} → ${to}`);
  }
}

export function assertTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
