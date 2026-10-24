import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { reviewSubmission } from "../agent/review";
import { db, schema } from "../db/client";
import { env } from "../env";
import { ApiError } from "../lib/errors";
import { storeTextDelivery } from "../lib/storage";
import { terac } from "../terac/client";
import { getProject, transition } from "./projects";

// La respuesta a una lectura de Terac puede llegar después de otra más reciente.
function monotonicStatus(incoming: string) {
  return sql<string>`case
    when ${schema.submissions.status} in ('approved', 'rejected', 'abandoned') then ${schema.submissions.status}
    when ${schema.submissions.status} = 'awaiting_review' and ${incoming} in ('screen_passed', 'in_progress') then ${schema.submissions.status}
    else ${incoming} end`;
}

/** Atribuye la entrega únicamente a la oportunidad que devuelve Terac. */
export async function syncSubmission(teracSubmissionId: string) {
  const external = await terac.getSubmission(teracSubmissionId);
  const opportunity = await db().query.teracOpportunities.findFirst({
    where: eq(schema.teracOpportunities.terac_opportunity_id, external.opportunity_id),
  });
  if (!opportunity) throw new ApiError("NOT_FOUND", "La oportunidad no pertenece a BilingualCheck");
  const summary = {
    name: external.participant_name,
    specialty: external.participant_background?.experiences.find(experience => experience.role?.trim())?.role?.trim() ?? null,
    experience: (external.participant_background?.experiences ?? []).slice(0, 3)
      .map((e) => [e.role, e.company].filter(Boolean).join(" · ")),
  };
  const [submission] = await db().insert(schema.submissions).values({
    opportunity_id: opportunity.id, terac_submission_id: external.id,
    status: external.status, participant_summary: summary,
  }).onConflictDoUpdate({ target: schema.submissions.terac_submission_id, set: {
    status: monotonicStatus(external.status), participant_summary: summary, updated_at: new Date(),
  } }).returning();
  const status = submission!.status;
  let project = await getProject(opportunity.project_id);
  // Un webhook puede saltarse in_progress y llegar directamente con awaiting_review.
  if (["in_progress", "awaiting_review"].includes(status) && project.status === "recruiting") {
    project = await transition(project.id, "recruiting", "in_progress");
  }
  if (status === "awaiting_review" && project.status === "in_progress") {
    await transition(project.id, "in_progress", "in_review");
  }
  if (status === "awaiting_review") await reviewPendingSubmission(submission!.id);
  return { submission: submission!, opportunity, external };
}

/** Guarda cada versión como archivo privado antes de permitir la revisión. */
export async function receiveDelivery(projectId: string, externalId: string, text: string) {
  // Comprobar la pertenencia ANTES de sincronizar evita modificar otro proyecto.
  const external = await terac.getSubmission(externalId);
  const opportunity = await db().query.teracOpportunities.findFirst({ where: and(
    eq(schema.teracOpportunities.project_id, projectId),
    eq(schema.teracOpportunities.terac_opportunity_id, external.opportunity_id),
  ) });
  if (!opportunity) throw new ApiError("NOT_FOUND", "Entrega no encontrada en este proyecto");
  if (!["in_progress", "awaiting_review"].includes(external.status)) {
    throw new ApiError("INVALID_STATE", "Esta entrega ya no acepta contenido");
  }
  const project = await getProject(projectId);
  if (!["recruiting", "in_progress", "in_review", "revision"].includes(project.status)) {
    throw new ApiError("INVALID_STATE", "El proyecto no acepta entregas");
  }
  // La sincronización no llama a la IA con una versión anterior durante la subida.
  const [sub] = await db().insert(schema.submissions).values({
    opportunity_id: opportunity.id, terac_submission_id: external.id, status: external.status,
  }).onConflictDoUpdate({ target: schema.submissions.terac_submission_id, set: { status: monotonicStatus(external.status) } }).returning();
  if (sub!.client_decision === "approved") throw new ApiError("INVALID_STATE", "Entrega ya aprobada");
  if (!["in_progress", "awaiting_review"].includes(sub!.status)) throw new ApiError("INVALID_STATE", "Esta entrega ya está cerrada");
  if (sub!.delivery_text === text) return sub!; // reenviar el formulario no crea otra versión
  const path = `${projectId}/${sub!.id}/${crypto.randomUUID()}.txt`;
  await storeTextDelivery(path, text);
  return db().transaction(async (tx) => {
    const [asset] = await tx.insert(schema.assets).values({
      project_id: projectId, kind: "deliverable", storage_path: path,
      filename: `delivery-${sub!.content_version + 1}.txt`, mime_type: "text/plain", uploaded: true,
    }).returning();
    const [updated] = await tx.update(schema.submissions).set({
      delivery_text: text, delivery_asset_id: asset!.id, content_version: sql`${schema.submissions.content_version} + 1`,
      ai_review: null, client_decision: null, review_started_at: null, review_error: null, updated_at: new Date(),
    }).where(and(eq(schema.submissions.id, sub!.id), eq(schema.submissions.content_version, sub!.content_version),
      or(isNull(schema.submissions.client_decision), eq(schema.submissions.client_decision, "changes_requested"))))
      .returning();
    if (!updated) throw new ApiError("INVALID_STATE", "La entrega cambió. Recarga antes de enviar de nuevo");
    return updated;
  });
}

/** Lease y versión evitan revisión simultánea y publicación duplicada. Se puede reintentar. */
export async function reviewPendingSubmission(id: string) {
  const sub = await db().query.submissions.findFirst({ where: eq(schema.submissions.id, id) });
  if (!sub || sub.status !== "awaiting_review" || !sub.delivery_text || sub.client_decision === "approved" ||
    sub.reviewed_version >= sub.content_version) return;
  const opportunity = await db().query.teracOpportunities.findFirst({ where: eq(schema.teracOpportunities.id, sub.opportunity_id) });
  if (!opportunity) return;
  const project = await getProject(opportunity.project_id);
  if (!project.brief || !["in_review", "revision"].includes(project.status)) return;
  const started = new Date();
  const [claimed] = await db().update(schema.submissions).set({ review_started_at: started, review_error: null })
    .where(and(eq(schema.submissions.id, id), eq(schema.submissions.content_version, sub.content_version),
      eq(schema.submissions.status, "awaiting_review"),
      lt(schema.submissions.reviewed_version, sub.content_version),
      or(isNull(schema.submissions.review_started_at), lt(schema.submissions.review_started_at, new Date(Date.now() - 600_000)))))
    .returning();
  if (!claimed) return;
  try {
    const review = await reviewSubmission({ brief: project.brief, clientLanguage: project.source_language,
      deliverables: [{ type: "text", text: sub.delivery_text }] });
    await db().transaction(async (tx) => {
      const [updated] = await tx.update(schema.submissions).set({ ai_review: review, reviewed_version: sub.content_version,
        review_started_at: null, review_error: null, updated_at: new Date() })
        .where(and(eq(schema.submissions.id, id), eq(schema.submissions.content_version, sub.content_version),
          eq(schema.submissions.status, "awaiting_review"),
          eq(schema.submissions.review_started_at, started), lt(schema.submissions.reviewed_version, sub.content_version)))
        .returning();
      if (!updated) return; // nueva versión recibida mientras la IA trabajaba
      await tx.update(schema.projects).set({ status: "in_review", updated_at: new Date() })
        .where(and(eq(schema.projects.id, project.id), eq(schema.projects.status, "revision")));
      await tx.insert(schema.messages).values({ project_id: project.id, user_id: project.user_id,
        role: "assistant", content: review.cultural_changes_explained, language: project.source_language,
        card: { type: "delivery", submission_id: id, review }, asset_ids: sub.delivery_asset_id ? [sub.delivery_asset_id] : [] });
      await tx.insert(schema.agentRuns).values({ project_id: project.id, trigger: "submission_review", model: env().REVIEW_MODEL });
    });
  } catch (error) {
    await db().update(schema.submissions).set({ review_started_at: null,
      review_error: "review_failed", updated_at: new Date() })
      .where(and(eq(schema.submissions.id, id), eq(schema.submissions.review_started_at, started)));
    throw error;
  }
}
