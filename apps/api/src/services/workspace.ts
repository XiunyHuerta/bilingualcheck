import { taskProgress, type TaskPatchBody } from "@bc/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, schema } from "../db/client";
import type { Project } from "../db/schema";
import { ApiError } from "../lib/errors";
import { getOwnedProject } from "./projects";

/** The approved scope is the source of tasks. No estimates or completion are invented. */
export async function ensureProjectTasks(project: Project) {
  if (!project.brief || !project.brief_confirmed) return;
  await db().insert(schema.projectTasks).values(project.brief.deliverables.map((title, index) => ({
    project_id: project.id, origin_key: `brief:${index}`, title: title.slice(0, 500),
    description: project.brief!.acceptance_criteria.join("\n"), deliverables: [title],
    status: project.status === "delivered" ? "completed" as const : "todo" as const,
  }))).onConflictDoNothing({ target: [schema.projectTasks.project_id, schema.projectTasks.origin_key] });
}

export async function projectWorkspace(projectId: string, userId: string) {
  const project = await getOwnedProject(projectId, userId);
  await ensureProjectTasks(project);
  const [tasks, activity, professionals, quotes, payments, messages, opportunities] = await Promise.all([
    db().query.projectTasks.findMany({ where: eq(schema.projectTasks.project_id, projectId), orderBy: asc(schema.projectTasks.created_at) }),
    db().query.projectActivity.findMany({ where: eq(schema.projectActivity.project_id, projectId), orderBy: desc(schema.projectActivity.created_at), limit: 100 }),
    db().select({ submission: schema.submissions }).from(schema.submissions).innerJoin(schema.teracOpportunities,
      eq(schema.submissions.opportunity_id, schema.teracOpportunities.id)).where(and(eq(schema.teracOpportunities.project_id, projectId),
        inArray(schema.submissions.status, ["screen_passed", "in_progress", "awaiting_review", "approved"]))),
    db().query.quotes.findMany({ where: eq(schema.quotes.project_id, projectId), orderBy: desc(schema.quotes.created_at), limit: 1 }),
    db().query.payments.findMany({ where: eq(schema.payments.project_id, projectId), orderBy: desc(schema.payments.created_at), limit: 1 }),
    db().query.messages.findMany({ where: eq(schema.messages.project_id, projectId), orderBy: desc(schema.messages.created_at), limit: 30 }),
    db().query.teracOpportunities.findMany({ where: eq(schema.teracOpportunities.project_id, projectId) }),
  ]);
  // Only the fields supplied by Terac are exposed; no inferred ratings, credentials or contacts.
  const team = professionals.map(({ submission: sub }) => ({ id: sub.id, status: sub.status,
    participant_summary: sub.participant_summary, client_decision: sub.client_decision,
    content_version: sub.content_version, reviewed_version: sub.reviewed_version,
    has_delivery: Boolean(sub.delivery_text || sub.delivery_asset_id),
    ai_review: sub.ai_review, updated_at: sub.updated_at, created_at: sub.created_at,
  }));
  return { project, tasks, progress: taskProgress(tasks), activity, professionals: team,
    messages, quote: quotes[0] ?? null,
    payment: payments[0] ? { status: payments[0].status, amount_usd: payments[0].amount_usd,
      is_demo: payments[0].whop_payment_id?.startsWith("demo_") ?? false } : null,
    matching: { requested: opportunities.length > 0, status: opportunities[0]?.status ?? null,
      external_id: opportunities[0]?.terac_opportunity_id ?? null, mode: process.env.TERAC_MODE ?? "replay" },
  };
}

export async function dashboardWorkspace(userId: string) {
  const projects = await db().query.projects.findMany({ where: eq(schema.projects.user_id, userId), orderBy: desc(schema.projects.updated_at) });
  if (!projects.length) return { projects: [], tasks: [], professionals: [], activity: [], messages: [], mode: process.env.TERAC_MODE ?? "replay" };
  const ids = projects.map(project => project.id);
  const [tasks, professionals, activity, messages] = await Promise.all([
    db().query.projectTasks.findMany({ where: inArray(schema.projectTasks.project_id, ids) }),
    db().select({ project_id: schema.teracOpportunities.project_id, id: schema.submissions.id,
      status: schema.submissions.status, participant_summary: schema.submissions.participant_summary,
      client_decision: schema.submissions.client_decision }).from(schema.submissions)
      .innerJoin(schema.teracOpportunities, eq(schema.submissions.opportunity_id, schema.teracOpportunities.id))
      .where(and(inArray(schema.teracOpportunities.project_id, ids), inArray(schema.submissions.status, ["screen_passed", "in_progress", "awaiting_review", "approved"]))),
    db().query.projectActivity.findMany({ where: inArray(schema.projectActivity.project_id, ids), orderBy: desc(schema.projectActivity.created_at), limit: 40 }),
    db().query.messages.findMany({ where: and(inArray(schema.messages.project_id, ids), eq(schema.messages.role, "assistant")), orderBy: desc(schema.messages.created_at), limit: 15 }),
  ]);
  return { projects, tasks, professionals, activity, messages, mode: process.env.TERAC_MODE ?? "replay" };
}

export async function updateTask(projectId: string, taskId: string, userId: string, input: z.infer<typeof TaskPatchBody>) {
  const project = await getOwnedProject(projectId, userId);
  return db().transaction(async tx => {
    const [task] = await tx.select().from(schema.projectTasks).where(and(
      eq(schema.projectTasks.id, taskId), eq(schema.projectTasks.project_id, projectId))).for("update");
    if (!task) throw new ApiError("NOT_FOUND", "Tarea no encontrada");
    if (task.version !== input.version) throw new ApiError("INVALID_STATE", "La tarea cambió. Recarga antes de guardar.");
    if (input.status && ["delivered", "failed", "refunded"].includes(project.status)) {
      throw new ApiError("INVALID_STATE", "El proyecto está cerrado");
    }
    if (input.assigned_submission_id) {
      const [member] = await tx.select({ id: schema.submissions.id }).from(schema.submissions)
        .innerJoin(schema.teracOpportunities, eq(schema.submissions.opportunity_id, schema.teracOpportunities.id))
        .where(and(eq(schema.submissions.id, input.assigned_submission_id), eq(schema.teracOpportunities.project_id, projectId),
          inArray(schema.submissions.status, ["screen_passed", "in_progress", "awaiting_review", "approved"])));
      if (!member) throw new ApiError("VALIDATION_ERROR", "El profesional no pertenece al proyecto");
    }
    if (input.status && ["in_progress", "in_review", "completed"].includes(input.status)) {
      if (!["in_progress", "in_review", "revision"].includes(project.status)) throw new ApiError("INVALID_STATE", "El trabajo aún no está autorizado");
      if (task.dependencies.length) {
        const dependencies = await tx.select().from(schema.projectTasks).where(and(
          eq(schema.projectTasks.project_id, projectId), inArray(schema.projectTasks.id, task.dependencies)));
        if (dependencies.length !== task.dependencies.length || dependencies.some(item => item.status !== "completed")) {
          throw new ApiError("INVALID_STATE", "Hay tareas previas pendientes");
        }
      }
    }
    const now = new Date();
    const [updated] = await tx.update(schema.projectTasks).set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.assigned_submission_id !== undefined ? { assigned_submission_id: input.assigned_submission_id } : {}),
      ...(input.due_at !== undefined ? { due_at: input.due_at ? new Date(input.due_at) : null } : {}),
      ...(input.comment ? { comments: [...task.comments, { text: input.comment, actor: "owner" as const, created_at: now.toISOString() }].slice(-100) } : {}),
      version: sql`${schema.projectTasks.version} + 1`, updated_at: now,
    }).where(eq(schema.projectTasks.id, taskId)).returning();
    await tx.insert(schema.projectActivity).values({ project_id: projectId, actor: "owner",
      action: input.status && input.status !== task.status ? "task_status" : "task_updated",
      task_id: taskId, previous_status: task.status, new_status: input.status ?? task.status,
      detail: input.comment ?? task.title });
    return updated!;
  });
}
