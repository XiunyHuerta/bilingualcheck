import { meetingTransition, validMeetingTime, type CollaborationInput, type CollaborationRole, type MeetingAction } from "@bc/shared";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { ApiError } from "../lib/errors";

const activeProjects = ["recruiting", "in_progress", "in_review", "revision"] as const;

export async function projectProfessional(projectId: string, submissionId: string) {
  const [row] = await db().select({ submission: schema.submissions }).from(schema.submissions)
    .innerJoin(schema.teracOpportunities, eq(schema.submissions.opportunity_id, schema.teracOpportunities.id))
    .where(and(eq(schema.submissions.id, submissionId), eq(schema.teracOpportunities.project_id, projectId))).limit(1);
  if (!row) throw new ApiError("NOT_FOUND", "Profesional no encontrado en este proyecto");
  return row.submission;
}

export async function listCollaboration(projectId: string, submissionId: string, before?: Date) {
  return db().query.collaboration.findMany({ where: and(eq(schema.collaboration.project_id, projectId),
    eq(schema.collaboration.submission_id, submissionId), before ? lt(schema.collaboration.updated_at, before) : undefined),
    orderBy: [desc(schema.collaboration.updated_at), desc(schema.collaboration.id)], limit: 100 });
}

/** Serialize scheduling for this assignment, so simultaneous confirmations cannot overlap. */
export async function createCollaboration(projectId: string, submissionId: string, actor: CollaborationRole, input: CollaborationInput) {
  await projectProfessional(projectId, submissionId);
  if (input.kind === "meeting" && !validMeetingTime(input.starts_at)) {
    throw new ApiError("VALIDATION_ERROR", "Elige una fecha futura dentro de los próximos 180 días");
  }
  if (actor === "client" && input.kind === "meeting" && input.meeting_url) {
    throw new ApiError("VALIDATION_ERROR", "El profesional compartirá el enlace de la llamada");
  }
  return db().transaction(async (tx) => {
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).for("update");
    const [sub] = await tx.select().from(schema.submissions).where(eq(schema.submissions.id, submissionId)).for("update");
    if (!project || !sub || !activeProjects.includes(project.status as typeof activeProjects[number]) ||
      !["in_progress", "awaiting_review"].includes(sub.status) || sub.client_decision === "approved") {
      throw new ApiError("INVALID_STATE", "Este proyecto ya no admite mensajes o reuniones");
    }
    const [item] = await tx.insert(schema.collaboration).values({ project_id: projectId, submission_id: submissionId,
      kind: input.kind, author: actor, updated_by: actor, message: input.message,
      client_read_at: actor === "client" ? new Date() : null,
      ...(input.kind === "meeting" ? { starts_at: new Date(input.starts_at), duration_minutes: input.duration_minutes,
        meeting_url: input.meeting_url ?? null, status: "proposed" as const } : {}),
    }).returning();
    return item!;
  });
}

export async function actOnMeeting(projectId: string, submissionId: string, itemId: string, actor: CollaborationRole, input: MeetingAction) {
  await projectProfessional(projectId, submissionId);
  return db().transaction(async (tx) => {
    // Consistent lock order with creation and confirmations for the same project.
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).for("update");
    const [sub] = await tx.select().from(schema.submissions).where(eq(schema.submissions.id, submissionId)).for("update");
    const item = await tx.query.collaboration.findFirst({ where: and(eq(schema.collaboration.id, itemId),
      eq(schema.collaboration.project_id, projectId), eq(schema.collaboration.submission_id, submissionId)) });
    if (!item || item.kind !== "meeting" || !item.status || !item.starts_at) throw new ApiError("NOT_FOUND", "Reunión no encontrada");
    if (!project || !sub || !activeProjects.includes(project.status as typeof activeProjects[number]) ||
      sub.client_decision === "approved" || !["in_progress", "awaiting_review"].includes(sub.status)) {
      throw new ApiError("INVALID_STATE", "El proyecto ya está cerrado");
    }
    if (item.version !== input.version) throw new ApiError("INVALID_STATE", "La reunión cambió. Recarga antes de responder");
    if (input.action !== "cancel" && item.starts_at.getTime() <= Date.now()) throw new ApiError("INVALID_STATE", "Esta reunión ya pasó");
    let status;
    try { status = meetingTransition(item.status, item.author, actor, input.action); }
    catch { throw new ApiError("INVALID_STATE", "No puedes realizar esta acción sobre la reunión"); }
    if ((input.action === "share_link" && !input.meeting_url) || (input.meeting_url && actor !== "professional")) {
      throw new ApiError("VALIDATION_ERROR", "Solo el profesional puede compartir un enlace de llamada válido");
    }
    if (input.action === "confirm") {
      const overlap = await tx.query.collaboration.findFirst({ where: and(
        eq(schema.collaboration.project_id, projectId), eq(schema.collaboration.status, "confirmed"),
        lt(schema.collaboration.starts_at, new Date(item.starts_at.getTime() + item.duration_minutes! * 60_000)),
        sql`${schema.collaboration.starts_at} + ${schema.collaboration.duration_minutes} * interval '1 minute' > ${item.starts_at.toISOString()}::timestamptz`,
      ) });
      if (overlap) throw new ApiError("INVALID_STATE", "Ya hay una reunión confirmada en este horario para el proyecto");
    }
    const [updated] = await tx.update(schema.collaboration).set({ status, version: item.version + 1,
      updated_by: actor, client_read_at: actor === "client" ? new Date() : null, updated_at: new Date(),
      ...(input.meeting_url ? { meeting_url: input.meeting_url } : {}),
    }).where(and(eq(schema.collaboration.id, itemId), eq(schema.collaboration.version, input.version))).returning();
    if (!updated) throw new ApiError("INVALID_STATE", "La reunión cambió. Recarga antes de responder");
    return updated;
  });
}

export async function clientNotifications(userId: string) {
  const condition = and(eq(schema.projects.user_id, userId), eq(schema.collaboration.updated_by, "professional"),
    isNull(schema.collaboration.client_read_at));
  const [items, count] = await Promise.all([
    db().select({ item: schema.collaboration, professional: schema.submissions.participant_summary,
      brief: schema.projects.brief }).from(schema.collaboration)
      .innerJoin(schema.projects, eq(schema.collaboration.project_id, schema.projects.id))
      .innerJoin(schema.submissions, eq(schema.collaboration.submission_id, schema.submissions.id))
      .where(condition).orderBy(desc(schema.collaboration.updated_at)).limit(100),
    db().select({ count: sql<number>`count(*)::int` }).from(schema.collaboration)
      .innerJoin(schema.projects, eq(schema.collaboration.project_id, schema.projects.id)).where(condition),
  ]);
  return { unread_count: count[0]?.count ?? 0,
    notifications: items.map(({ item, professional, brief }) => ({ ...item, professional,
      project_name: brief?.business.name ?? null })) };
}

export async function readNotification(userId: string, id: string, version: number) {
  // Scope the mutation itself to ownership and the version actually shown to the client.
  await db().update(schema.collaboration).set({ client_read_at: new Date() }).where(and(
    eq(schema.collaboration.id, id), eq(schema.collaboration.version, version),
    inArray(schema.collaboration.project_id, db().select({ id: schema.projects.id }).from(schema.projects)
      .where(eq(schema.projects.user_id, userId))),
  ));
}
