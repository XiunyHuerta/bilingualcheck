import { assertTransition, type Card, type ProjectStatus } from "@bc/shared";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { ApiError } from "../lib/errors";

export async function getOwnedProject(projectId: string, userId: string) {
  const project = await db().query.projects.findFirst({
    where: and(eq(schema.projects.id, projectId), eq(schema.projects.user_id, userId)),
  });
  if (!project) throw new ApiError("NOT_FOUND", "Proyecto no encontrado");
  return project;
}

export async function getProject(projectId: string) {
  const project = await db().query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project) throw new ApiError("NOT_FOUND", "Proyecto no encontrado");
  return project;
}

/**
 * Única puerta para cambiar projects.status. Valida la transición con la tabla
 * compartida y hace un update condicional para que dos eventos simultáneos
 * no salten estados.
 */
export async function transition(
  projectId: string,
  from: ProjectStatus,
  to: ProjectStatus,
  patch: Partial<typeof schema.projects.$inferInsert> = {},
) {
  assertTransition(from, to);
  const [row] = await db()
    .update(schema.projects)
    .set({ ...patch, status: to, updated_at: new Date() })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.status, from)))
    .returning();
  if (!row) {
    throw new ApiError("INVALID_STATE", `El proyecto ya no está en '${from}'`, { expected: from, to });
  }
  return row;
}

export function requireStatus(current: ProjectStatus, allowed: readonly ProjectStatus[], action: string) {
  if (!allowed.includes(current)) {
    throw new ApiError("INVALID_STATE", `No se puede ${action} con el proyecto en '${current}'`, {
      status: current,
      allowed,
    });
  }
}

export async function addMessage(input: {
  projectId: string;
  userId: string;
  role: "user" | "assistant" | "system_event";
  content: string;
  card?: Card;
  language?: string | null;
  assetIds?: string[];
}) {
  const [row] = await db()
    .insert(schema.messages)
    .values({
      project_id: input.projectId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      card: input.card,
      language: input.language ?? null,
      asset_ids: input.assetIds,
    })
    .returning();
  return row!;
}
