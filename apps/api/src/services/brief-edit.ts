import { type Brief, BriefSchema } from "@bc/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client";
import type { Project } from "../db/schema";
import { ApiError } from "../lib/errors";

export function briefIsEditable(project: Pick<Project, "brief" | "status" | "agent_busy" | "brief_confirmed">,
  _payment: { whop_payment_id: string | null } | null | undefined, hasOpportunity: boolean) {
  if (!project.brief || project.agent_busy || hasOpportunity) return false;
  return !project.brief_confirmed && ["intake", "brief_ready"].includes(project.status);
}

export async function editProjectBrief(projectId: string, userId: string,
  input: { brief: Brief; expected_updated_at: string; content: string; ui_language: "es" | "en" | "pt" }) {
  const brief = BriefSchema.parse(input.brief);
  return db().transaction(async tx => {
    const [project] = await tx.select().from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.user_id, userId))).for("update");
    if (!project) throw new ApiError("NOT_FOUND", "Proyecto no encontrado");
    const [payment, opportunity] = await Promise.all([
      tx.query.payments.findFirst({ where: eq(schema.payments.project_id, projectId), orderBy: desc(schema.payments.created_at) }),
      tx.query.teracOpportunities.findFirst({ where: eq(schema.teracOpportunities.project_id, projectId) }),
    ]);
    if (project.agent_busy) throw new ApiError("INVALID_STATE", {
      es: "El agente está respondiendo. Espera un momento antes de editar el resumen.",
      en: "The agent is responding. Wait a moment before editing the brief.",
      pt: "O agente está respondendo. Aguarde um momento antes de editar o resumo.",
    }[input.ui_language], { action: "retry" });
    if (!briefIsEditable(project, payment, Boolean(opportunity))) {
      throw new ApiError("INVALID_STATE", {
        es: "El alcance ya está confirmado. Añade aclaraciones en la conversación; para otro servicio, abre un nuevo proyecto con una nueva cotización.",
        en: "The scope is already confirmed. Add clarifications in the conversation; a different service needs a new project and quote.",
        pt: "O escopo já está confirmado. Adicione esclarecimentos na conversa; outro serviço precisa de um novo projeto e orçamento.",
      }[input.ui_language], { action: "new_project" });
    }
    if (JSON.stringify(brief) === JSON.stringify(BriefSchema.parse(project.brief))) return { project, reused: true };
    if (project.updated_at.getTime() !== new Date(input.expected_updated_at).getTime()) {
      throw new ApiError("INVALID_STATE", "El brief cambió mientras lo editabas. Revisa la versión actual.");
    }
    if (JSON.stringify(brief.asset_ids) !== JSON.stringify(project.brief!.asset_ids)) {
      throw new ApiError("VALIDATION_ERROR", "Los archivos se gestionan desde Adjuntar");
    }
    // No professional opportunity exists yet, so rebuild task scope from the next confirmed plan.
    await tx.delete(schema.projectTasks).where(eq(schema.projectTasks.project_id, projectId));
    // Any abandoned draft quote must not be reused for a changed draft.
    await tx.update(schema.quotes).set({ status: "unavailable", updated_at: new Date() })
      .where(and(eq(schema.quotes.project_id, projectId), inArray(schema.quotes.status, ["requested", "priced"])));
    const [updated] = await tx.update(schema.projects).set({ brief, brief_confirmed: false,
      status: "brief_ready", source_language: brief.source_language,
      target_language: brief.target_language, target_market: brief.target_market, updated_at: new Date() })
      .where(eq(schema.projects.id, projectId)).returning();
    const messageTime = Date.now();
    await tx.insert(schema.messages).values([
      { project_id: projectId, user_id: userId, role: "user", content: input.content, language: project.source_language, created_at: new Date(messageTime) },
      { project_id: projectId, user_id: userId, role: "assistant", language: project.source_language,
        created_at: new Date(messageTime + 1),
        content: { es: "Actualicé el brief. Revisa los cambios y confírmalo para continuar.",
          en: "Brief updated. Review your changes and confirm it to continue.",
          pt: "Brief atualizado. Revise as alterações e confirme para continuar." }[input.ui_language],
        card: { type: "brief", brief } },
    ]);
    return { project: updated!, reused: false };
  });
}
