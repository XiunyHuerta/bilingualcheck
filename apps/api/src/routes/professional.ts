import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { CollaborationBody, MeetingActionBody, type CollaborationItem } from "@bc/shared";
import { db, schema } from "../db/client";
import { env } from "../env";
import { runInBackground } from "../lib/background";
import { verifyDeliveryToken } from "../lib/delivery-token";
import { ApiError } from "../lib/errors";
import { signedDownloadUrl } from "../lib/storage";
import { getProject } from "../services/projects";
import { receiveDelivery, syncSubmission } from "../services/submissions";
import { terac } from "../terac/client";
import { actOnMeeting, createCollaboration, listCollaboration } from "../services/collaboration";
import { professionalContactHtml } from "../services/professional-contact";
import { businessProfileHtml, profileMedia } from "../services/business-profile";

export const professionalRoutes = new Hono();
export const DeliveryText = z.string().trim().min(20).max(50_000);
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// URL-encoded Unicode puede ocupar hasta 12 bytes por carácter; el texto se limita aparte.
professionalRoutes.use("/professional/*", bodyLimit({ maxSize: 700_000 }));
professionalRoutes.use("/professional/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  await next();
});

async function context(token: string, externalId: string) {
  const projectId = await verifyDeliveryToken(token).catch(() => {
    throw new ApiError("UNAUTHORIZED", "El enlace de entrega no es válido o ha caducado");
  });
  if (!externalId || externalId.length > 200) throw new ApiError("VALIDATION_ERROR", "Abre el enlace desde tu tarea de Terac");
  const external = await terac.getSubmission(externalId);
  const opportunity = await db().query.teracOpportunities.findFirst({ where: and(
    eq(schema.teracOpportunities.project_id, projectId),
    eq(schema.teracOpportunities.terac_opportunity_id, external.opportunity_id),
  ) });
  if (!opportunity) throw new ApiError("NOT_FOUND", "Entrega no encontrada");
  const project = await getProject(projectId);
  // Register the verified assignment before its first delivery, so the client can see its profile.
  await db().insert(schema.submissions).values({ opportunity_id: opportunity.id,
    terac_submission_id: external.id, status: external.status,
    participant_summary: { name: external.participant_name,
      experience: (external.participant_background?.experiences ?? []).slice(0, 3)
        .map((v) => [v.role, v.company].filter(Boolean).join(" · ")) },
  }).onConflictDoNothing({ target: schema.submissions.terac_submission_id });
  const submission = await db().query.submissions.findFirst({ where: eq(schema.submissions.terac_submission_id, external.id) });
  if (!submission) throw new ApiError("NOT_FOUND", "Profesional no encontrado");
  return { project, external, submission };
}

const page = (content: string) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BilingualCheck · Professional delivery</title><style>
*{box-sizing:border-box}body{margin:0;background:#F5F0D7;color:#202835;font:17px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}main{width:calc(100% - 48px);max-width:1280px;margin:32px auto;padding:32px;background:#FFFDF7;border-radius:30px}h1,h2{color:#315A9E}h1{font-size:clamp(28px,3vw,44px);line-height:1.2}section{min-width:0;background:white;border:1px solid #20283520;border-radius:22px;padding:22px;margin:20px 0}textarea{display:block;width:100%;min-height:320px;padding:16px;margin:12px 0 20px;border:1px solid #315A9E;border-radius:14px;font:inherit;resize:vertical}button{max-width:100%;background:#315A9E;color:white;border:0;border-radius:14px;padding:14px 24px;font:inherit;cursor:pointer}a{color:#315A9E}pre{white-space:pre-wrap;overflow-wrap:anywhere}.note{background:#E7F0F9;padding:16px;border-radius:14px}.delivery-workspace>*{min-width:0}@media(min-width:1024px){.delivery-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:28px;align-items:start}textarea{min-height:420px}}@media(max-width:767px){main{width:calc(100% - 16px);margin:8px;padding:18px}section{padding:18px}button{width:100%}}</style><main><b>BilingualCheck</b>${content}</main></html>`;

professionalRoutes.get("/professional/delivery", async (c) => {
  const externalId = c.req.query("teracSubmissionId") ?? c.req.query("submissionId") ?? "";
  const { project, external, submission: sub } = await context(c.req.query("token") ?? "", externalId);
  c.header("Content-Security-Policy", `default-src 'none'; img-src ${new URL(env().SUPABASE_URL).origin}; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  if (!project.brief) throw new ApiError("INVALID_STATE", "El proyecto no tiene brief confirmado");
  const brief = project.brief;
  const owner = await db().query.users.findFirst({ where: eq(schema.users.id, project.user_id) });
  const businessContext = owner?.business_profile?.share_with_professionals
    ? businessProfileHtml(owner.business_name, owner.business_profile, await profileMedia(owner.business_profile, owner.id)) : "";
  const uploads = brief.asset_ids.length ? await db().query.assets.findMany({ where: and(
    eq(schema.assets.project_id, project.id), inArray(schema.assets.id, brief.asset_ids), eq(schema.assets.uploaded, true),
  ) }) : [];
  const links = await Promise.all(uploads.map(async (a) => `<li><a rel="noreferrer" href="${escapeHtml(await signedDownloadUrl(env().STORAGE_BUCKET_UPLOADS, a.storage_path))}">${escapeHtml(a.filename)}</a></li>`));
  const list = (values: string[]) => `<ul>${values.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>`;
  const editable = ["in_progress", "awaiting_review"].includes(external.status) &&
    ["recruiting", "in_progress", "in_review", "revision"].includes(project.status) && sub?.client_decision !== "approved";
  const before = c.req.query("before");
  if (before && !z.iso.datetime({ offset: true }).safeParse(before).success) throw new ApiError("VALIDATION_ERROR", "Fecha inválida");
  const activity = await listCollaboration(project.id, sub.id, before ? new Date(before) : undefined);
  const contact = professionalContactHtml(c.req.url, JSON.parse(JSON.stringify(activity)) as CollaborationItem[], editable);
  return c.html(page(`<h1>${escapeHtml(brief.business.name)}</h1>
    <p>${escapeHtml(brief.source_language)} → ${escapeHtml(brief.target_language)}</p>
    <div class="delivery-workspace"><div>${businessContext}<section><h2>Project brief</h2><p>${escapeHtml(brief.goal)}</p><p>${escapeHtml(brief.business.offer)}</p>
    <p><b>Audience:</b> ${escapeHtml(brief.audience)}</p><p><b>Market:</b> ${escapeHtml(Object.values(brief.target_market).filter(Boolean).join(", "))}</p>
    <h3>Deliverables</h3>${list(brief.deliverables)}<h3>Acceptance criteria</h3>${list(brief.acceptance_criteria)}
    <h3>Cultural notes</h3>${list(brief.cultural_notes)}${links.length ? `<h3>Source materials</h3><ul>${links.join("")}</ul>` : ""}</section></div>
    <div>${sub?.client_feedback ? `<section><h2>Client feedback</h2><pre>${escapeHtml(sub.client_feedback)}</pre></section>` : ""}
    ${editable ? `<section><h2>Submit your work</h2><p>Paste the final adapted copy, cultural notes and recommendations. Write the deliverable in the target language. Keep a copy of your work.</p>
    <form method="post"><label for="text">Delivery (20–50,000 characters)</label><textarea id="text" name="delivery_text" required minlength="20" maxlength="50000">${escapeHtml(sub?.delivery_text ?? "")}</textarea><button>Submit delivery</button></form></section>` : "<p>This delivery is closed.</p>"}
    <p class="note">The client reviews your delivery before approving payment. Return here to read requested changes. After submitting, return to Terac to finish your task.</p></div></div>${contact}`));
});

professionalRoutes.post("/professional/contact", async (c) => {
  const { project, external, submission } = await context(c.req.query("token") ?? "",
    c.req.query("teracSubmissionId") ?? c.req.query("submissionId") ?? "");
  if (!["in_progress", "awaiting_review"].includes(external.status)) throw new ApiError("INVALID_STATE", "La tarea ya está cerrada");
  const form = await c.req.parseBody();
  const parsed = CollaborationBody.safeParse(form.kind === "meeting" ? { kind: "meeting", message: form.message,
    starts_at: `${form.starts_at}:00Z`, duration_minutes: Number(form.duration_minutes), meeting_url: form.meeting_url || undefined,
  } : { kind: form.kind, message: form.message });
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Revisa el mensaje, la fecha UTC y el enlace de videollamada");
  await createCollaboration(project.id, submission.id, "professional", parsed.data);
  const url = new URL(c.req.url); url.pathname = "/professional/delivery"; url.hash = "contact";
  return c.redirect(url.href, 303);
});

professionalRoutes.post("/professional/meeting", async (c) => {
  const { project, external, submission } = await context(c.req.query("token") ?? "",
    c.req.query("teracSubmissionId") ?? c.req.query("submissionId") ?? "");
  if (!["in_progress", "awaiting_review"].includes(external.status)) throw new ApiError("INVALID_STATE", "La tarea ya está cerrada");
  const form = await c.req.parseBody();
  const parsed = MeetingActionBody.safeParse({ action: form.action, version: Number(form.version), meeting_url: form.meeting_url || undefined });
  if (!parsed.success || !z.uuid().safeParse(form.item_id).success) throw new ApiError("VALIDATION_ERROR", "Revisa la acción y el enlace de videollamada");
  await actOnMeeting(project.id, submission.id, String(form.item_id), "professional", parsed.data);
  const url = new URL(c.req.url); url.pathname = "/professional/delivery"; url.hash = "contact";
  return c.redirect(url.href, 303);
});

professionalRoutes.post("/professional/delivery", async (c) => {
  const externalId = c.req.query("teracSubmissionId") ?? c.req.query("submissionId") ?? "";
  const { project } = await context(c.req.query("token") ?? "", externalId);
  const form = await c.req.parseBody();
  const parsed = DeliveryText.safeParse(form.delivery_text);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "La entrega debe tener entre 20 y 50.000 caracteres");
  await receiveDelivery(project.id, externalId, parsed.data);
  runInBackground("review_delivery", () => syncSubmission(externalId));
  return c.html(page("<h1>Delivery received</h1><p>Your work has been saved. Return to Terac and mark the task as finished so the client can review it.</p><p>You can reopen your task link to read feedback and submit requested changes.</p>"));
});
