import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { db, schema } from "../db/client";
import { env } from "../env";
import { runInBackground } from "../lib/background";
import { verifyDeliveryToken } from "../lib/delivery-token";
import { ApiError } from "../lib/errors";
import { signedDownloadUrl } from "../lib/storage";
import { getProject } from "../services/projects";
import { receiveDelivery, syncSubmission } from "../services/submissions";
import { terac } from "../terac/client";

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
  return { project, external };
}

const page = (content: string) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BilingualCheck · Professional delivery</title><style>
body{margin:0;background:#F5F0D7;color:#202835;font:17px/1.6 system-ui,sans-serif}main{max-width:800px;margin:32px auto;padding:28px;background:#FFFDF7;border-radius:30px}h1,h2{color:#315A9E}section{background:white;border:1px solid #20283520;border-radius:22px;padding:22px;margin:20px 0}textarea{box-sizing:border-box;width:100%;min-height:320px;padding:16px;border:1px solid #315A9E;border-radius:14px;font:inherit}button{background:#315A9E;color:white;border:0;border-radius:14px;padding:14px 24px;font:inherit;cursor:pointer}a{color:#315A9E}pre{white-space:pre-wrap;overflow-wrap:anywhere}.note{background:#E7F0F9;padding:16px;border-radius:14px}@media(max-width:600px){main{margin:8px;padding:18px}}</style><main><b>BilingualCheck</b>${content}</main></html>`;

professionalRoutes.get("/professional/delivery", async (c) => {
  const externalId = c.req.query("teracSubmissionId") ?? c.req.query("submissionId") ?? "";
  const { project, external } = await context(c.req.query("token") ?? "", externalId);
  if (!project.brief) throw new ApiError("INVALID_STATE", "El proyecto no tiene brief confirmado");
  const sub = await db().query.submissions.findFirst({ where: eq(schema.submissions.terac_submission_id, external.id) });
  const brief = project.brief;
  const uploads = brief.asset_ids.length ? await db().query.assets.findMany({ where: and(
    eq(schema.assets.project_id, project.id), inArray(schema.assets.id, brief.asset_ids), eq(schema.assets.uploaded, true),
  ) }) : [];
  const links = await Promise.all(uploads.map(async (a) => `<li><a rel="noreferrer" href="${escapeHtml(await signedDownloadUrl(env().STORAGE_BUCKET_UPLOADS, a.storage_path))}">${escapeHtml(a.filename)}</a></li>`));
  const list = (values: string[]) => `<ul>${values.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>`;
  const editable = ["in_progress", "awaiting_review"].includes(external.status) &&
    ["recruiting", "in_progress", "in_review", "revision"].includes(project.status) && sub?.client_decision !== "approved";
  return c.html(page(`<h1>${escapeHtml(brief.business.name)}</h1>
    <p>${escapeHtml(brief.source_language)} → ${escapeHtml(brief.target_language)}</p>
    <section><h2>Project brief</h2><p>${escapeHtml(brief.goal)}</p><p>${escapeHtml(brief.business.offer)}</p>
    <p><b>Audience:</b> ${escapeHtml(brief.audience)}</p><p><b>Market:</b> ${escapeHtml(Object.values(brief.target_market).filter(Boolean).join(", "))}</p>
    <h3>Deliverables</h3>${list(brief.deliverables)}<h3>Acceptance criteria</h3>${list(brief.acceptance_criteria)}
    <h3>Cultural notes</h3>${list(brief.cultural_notes)}${links.length ? `<h3>Source materials</h3><ul>${links.join("")}</ul>` : ""}</section>
    ${sub?.client_feedback ? `<section><h2>Client feedback</h2><pre>${escapeHtml(sub.client_feedback)}</pre></section>` : ""}
    ${editable ? `<section><h2>Submit your work</h2><p>Paste the final adapted copy, cultural notes and recommendations. Write the deliverable in the target language. Keep a copy of your work.</p>
    <form method="post"><label for="text">Delivery (20–50,000 characters)</label><textarea id="text" name="delivery_text" required minlength="20" maxlength="50000">${escapeHtml(sub?.delivery_text ?? "")}</textarea><button>Submit delivery</button></form></section>` : "<p>This delivery is closed.</p>"}
    <p class="note">The client reviews your delivery before approving payment. Return here to read requested changes. After submitting, return to Terac to finish your task.</p>`));
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
