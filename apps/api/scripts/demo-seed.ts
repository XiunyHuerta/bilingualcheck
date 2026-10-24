// Semilla explícitamente simulada para una cuenta que YA inició sesión con Whop.
// Uso: pnpm demo:seed --user-id=<uuid>. No emite sesiones ni hace pagos.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../src/db/client";
import { miamiBrief, miamiDelivery, miamiReview } from "../src/demo/miami";
import { env } from "../src/env";

if (env().TERAC_MODE !== "replay") throw new Error("demo:seed solo funciona con TERAC_MODE=replay");
const arg = process.argv.find((value) => value.startsWith("--user-id="))?.slice(10);
const userId = z.string().uuid().parse(arg);
const user = await db().query.users.findFirst({ where: eq(schema.users.id, userId) });
if (!user) throw new Error("La cuenta debe iniciar sesión con Whop antes de sembrar la demo");
const idFor = (name: string) => {
  const h = createHash("sha256").update(`bc-demo-v1:${userId}:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
for (const state of ["in_review", "delivered"] as const) {
  const projectId = idFor(state);
  await db().transaction(async (tx) => {
    const existing = await tx.query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), eq(schema.projects.user_id, userId)) });
    if (existing) return;
    await tx.insert(schema.projects).values({ id: projectId, user_id: userId, status: state,
      source_language: "es", target_language: "en", brief: miamiBrief, brief_confirmed: true });
    const [opportunity] = await tx.insert(schema.teracOpportunities).values({ project_id: projectId,
      terac_opportunity_id: `replay_demo_${projectId}`, status: state === "delivered" ? "completed" : "active" }).returning();
    const [sub] = await tx.insert(schema.submissions).values({ opportunity_id: opportunity!.id,
      terac_submission_id: `replay_sub_replay_demo_${projectId}`, status: state === "delivered" ? "approved" : "awaiting_review",
      participant_summary: { name: "Profesional de ejemplo", experience: ["Perfil ilustrativo para la demo"] },
      delivery_text: miamiDelivery, content_version: 1, reviewed_version: 1, ai_review: miamiReview,
      client_decision: state === "delivered" ? "approved" : null,
    }).returning();
    await tx.insert(schema.messages).values([
      { project_id: projectId, user_id: userId, role: "system_event", language: "es",
        content: "Proyecto de demostración: perfil, trabajo y revisión simulados. Sin contratación ni pago reales." },
      { project_id: projectId, user_id: userId, role: "assistant", language: "es", content: miamiReview.cultural_changes_explained,
        card: { type: "delivery", submission_id: sub!.id, review: miamiReview } },
    ]);
  });
  console.log(`Demo ${state}: ${projectId}`);
}
// postgres-js mantiene un pool; el script termina una vez completadas las transacciones.
process.exit(0);
