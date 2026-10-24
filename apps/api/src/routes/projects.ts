import { CreateAssetBody, CreateProjectBody, DecisionBody, PostMessageBody } from "@bc/shared";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { Hono } from "hono";
import { runAgentTurn } from "../agent/run";
import { db, schema } from "../db/client";
import { env } from "../env";
import { runInBackground } from "../lib/background";
import { ApiError } from "../lib/errors";
import { type AuthVars, requireSession } from "../lib/session";
import { signedDownloadUrl, signedUploadUrl } from "../lib/storage";
import { body } from "../lib/validate";
import { addMessage, getOwnedProject, requireStatus, transition } from "../services/projects";
import { terac } from "../terac/client";
import { createProjectCheckout } from "../whop/client";
import { checkoutReturnTo, parseCheckoutRequestBody } from "../whop/redirects";
import { reviewPendingSubmission } from "../services/submissions";
import { pollQuotes } from "./cron";

export const projectRoutes = new Hono<AuthVars>();
projectRoutes.use("*", requireSession);

const PAGE_SIZE = 50;

projectRoutes.get("/projects", async (c) => {
  const rows = await db().query.projects.findMany({
    where: eq(schema.projects.user_id, c.get("userId")),
    orderBy: desc(schema.projects.updated_at),
  });
  const last = rows.length
    ? await db()
        .selectDistinctOn([schema.messages.project_id])
        .from(schema.messages)
        .where(inArray(schema.messages.project_id, rows.map((p) => p.id)))
        .orderBy(schema.messages.project_id, desc(schema.messages.created_at))
    : [];
  const byProject = new Map(last.map((m) => [m.project_id, m]));
  return c.json({ projects: rows.map((p) => ({ ...p, last_message: byProject.get(p.id) ?? null })) });
});

projectRoutes.post("/projects", async (c) => {
  const input = await body(c, CreateProjectBody);
  const [project] = await db()
    .insert(schema.projects)
    .values({ user_id: c.get("userId"), source_language: input.source_language, target_language: input.target_language })
    .returning();
  runInBackground("greeting", () => runAgentTurn(project!.id, { type: "project_created" }));
  return c.json({ project }, 201);
});

projectRoutes.get("/projects/:id", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  if (project.status === "quoting") runInBackground("poll_project_quote", () => pollQuotes(project.id));
  const [quote, payment, opportunity] = await Promise.all([
    db().query.quotes.findFirst({ where: eq(schema.quotes.project_id, project.id), orderBy: desc(schema.quotes.created_at) }),
    db().query.payments.findFirst({ where: eq(schema.payments.project_id, project.id), orderBy: desc(schema.payments.created_at) }),
    db().query.teracOpportunities.findFirst({ where: eq(schema.teracOpportunities.project_id, project.id) }),
  ]);
  const submissions = opportunity
    ? await db().query.submissions.findMany({ where: eq(schema.submissions.opportunity_id, opportunity.id) })
    : [];
  return c.json({ project, quote: quote ?? null, payment: payment ?? null, submissions });
});

// ── Chat ──────────────────────────────────────────────────────────

projectRoutes.get("/projects/:id/messages", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  const before = c.req.query("before");
  const rows = await db().query.messages.findMany({
    where: and(
      eq(schema.messages.project_id, project.id),
      before ? lt(schema.messages.created_at, new Date(before)) : undefined,
    ),
    orderBy: desc(schema.messages.created_at),
    limit: PAGE_SIZE,
  });
  return c.json({ messages: rows.reverse(), has_more: rows.length === PAGE_SIZE });
});

projectRoutes.post("/projects/:id/messages", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  const input = await body(c, PostMessageBody);
  requireStatus(project.status, ["intake", "brief_ready", "quoting", "quoted", "awaiting_payment", "paid", "recruiting", "in_progress", "in_review", "revision", "delivered"], "enviar mensajes");
  const message = await addMessage({
    projectId: project.id,
    userId: project.user_id,
    role: "user",
    content: input.content,
    language: project.source_language,
    assetIds: input.asset_ids,
  });
  // Si el cliente corrige un brief pendiente, vuelve a la entrevista.
  if (project.status === "brief_ready" && !project.brief_confirmed) {
    await transition(project.id, "brief_ready", "intake").catch(() => undefined);
  }
  runInBackground("user_message", () => runAgentTurn(project.id, { type: "user_message" }));
  return c.json({ message }, 202);
});

projectRoutes.post("/projects/:id/brief/confirm", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  requireStatus(project.status, ["brief_ready"], "confirmar el brief");
  await db().update(schema.projects).set({ brief_confirmed: true }).where(eq(schema.projects.id, project.id));
  await addMessage({ projectId: project.id, userId: project.user_id, role: "system_event", content: "brief_confirmed" });
  runInBackground("brief_confirmed", () => runAgentTurn(project.id, { type: "brief_confirmed" }));
  return c.json({ ok: true }, 202);
});

// ── Archivos ──────────────────────────────────────────────────────

projectRoutes.post("/projects/:id/assets", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  const input = await body(c, CreateAssetBody);
  const safeName = input.filename.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${project.id}/${crypto.randomUUID()}-${safeName}`;
  const uploadUrl = await signedUploadUrl(env().STORAGE_BUCKET_UPLOADS, path);
  const [asset] = await db()
    .insert(schema.assets)
    .values({ project_id: project.id, kind: "client_upload", storage_path: path, filename: input.filename, mime_type: input.mime_type })
    .returning();
  return c.json({ asset_id: asset!.id, upload_url: uploadUrl }, 201);
});

projectRoutes.post("/projects/:id/assets/:assetId/complete", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  const [asset] = await db()
    .update(schema.assets)
    .set({ uploaded: true })
    .where(and(eq(schema.assets.id, c.req.param("assetId")), eq(schema.assets.project_id, project.id)))
    .returning();
  if (!asset) throw new ApiError("NOT_FOUND", "Archivo no encontrado");
  return c.json({ asset });
});

projectRoutes.get("/projects/:id/assets/:assetId/url", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  const asset = await db().query.assets.findFirst({
    where: and(eq(schema.assets.id, c.req.param("assetId")), eq(schema.assets.project_id, project.id)),
  });
  if (!asset) throw new ApiError("NOT_FOUND", "Archivo no encontrado");
  const bucket = asset.kind === "deliverable" ? env().STORAGE_BUCKET_DELIVERABLES : env().STORAGE_BUCKET_UPLOADS;
  return c.json({ url: await signedDownloadUrl(bucket, asset.storage_path) });
});

// ── Cotización y pago ─────────────────────────────────────────────

projectRoutes.post("/projects/:id/quote/accept", async (c) => {
  const { platform } = parseCheckoutRequestBody(await c.req.text());
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  requireStatus(project.status, ["quoted"], "aceptar la cotización");
  const quote = await db().query.quotes.findFirst({
    where: and(eq(schema.quotes.project_id, project.id), eq(schema.quotes.status, "priced")),
    orderBy: desc(schema.quotes.created_at),
  });
  if (!quote?.total_usd) throw new ApiError("INVALID_STATE", "No hay una cotización con precio");

  const checkout = await createProjectCheckout({
    projectId: project.id,
    quoteId: quote.id,
    totalUsd: quote.total_usd,
    title: `BilingualCheck · ${project.brief?.business.name ?? "Proyecto"}`,
    returnTo: checkoutReturnTo(platform),
  });
  await db().insert(schema.payments).values({
    project_id: project.id,
    quote_id: quote.id,
    whop_checkout_id: checkout.checkoutId,
    whop_variant_id: checkout.variantId,
    status: "pending",
    amount_usd: quote.total_usd,
  });
  await transition(project.id, "quoted", "awaiting_payment");
  return c.json({ purchase_url: checkout.purchaseUrl });
});

projectRoutes.get("/projects/:id/payment", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  const payment = await db().query.payments.findFirst({
    where: eq(schema.payments.project_id, project.id),
    orderBy: desc(schema.payments.created_at),
  });
  return c.json({ status: project.status, payment: payment ?? null });
});

// ── Entregas ──────────────────────────────────────────────────────

projectRoutes.get("/projects/:id/submissions", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  const opportunity = await db().query.teracOpportunities.findFirst({
    where: eq(schema.teracOpportunities.project_id, project.id),
  });
  const rows = opportunity
    ? await db().query.submissions.findMany({ where: eq(schema.submissions.opportunity_id, opportunity.id) })
    : [];
  return c.json({ submissions: rows });
});

projectRoutes.post("/projects/:id/submissions/:sid/decision", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  requireStatus(project.status, ["in_review"], "decidir sobre la entrega");
  const input = await body(c, DecisionBody);
  const opportunity = await db().query.teracOpportunities.findFirst({ where: eq(schema.teracOpportunities.project_id, project.id) });
  const submission = opportunity ? await db().query.submissions.findFirst({ where: and(
    eq(schema.submissions.id, c.req.param("sid")), eq(schema.submissions.opportunity_id, opportunity.id),
  ) }) : undefined;
  if (!submission) throw new ApiError("NOT_FOUND", "Entrega no encontrada");
  if (submission.client_decision) throw new ApiError("INVALID_STATE", "Ya hay una decisión sobre esta entrega");
  if (!submission.ai_review || submission.reviewed_version !== submission.content_version || submission.content_version === 0) {
    throw new ApiError("INVALID_STATE", "La revisión de la entrega todavía no ha terminado");
  }
  if (input.decision === "request_changes" && !input.feedback?.trim()) {
    throw new ApiError("VALIDATION_ERROR", "Describe los cambios que necesita la entrega");
  }
  await db().transaction(async (tx) => {
    // Serializa decisiones y nuevas versiones. El proveedor conserva la verdad del pago.
    const [locked] = await tx.select().from(schema.submissions)
      .where(eq(schema.submissions.id, submission.id)).for("update");
    if (!locked || locked.client_decision || locked.content_version !== submission.content_version) {
      throw new ApiError("INVALID_STATE", "La entrega cambió. Recarga antes de decidir");
    }
    if (input.decision === "approve") {
      const current = await terac.getSubmission(submission.terac_submission_id);
      if (current.status !== "approved") {
        if (current.status !== "awaiting_review") throw new ApiError("INVALID_STATE", "Terac todavía no permite aprobar esta entrega");
        await terac.approveSubmission(submission.terac_submission_id);
      }
    }
    const [changed] = await tx.update(schema.projects)
      .set({ status: input.decision === "approve" ? "delivered" : "revision", updated_at: new Date() })
      .where(and(eq(schema.projects.id, project.id), eq(schema.projects.status, "in_review"))).returning();
    if (!changed) throw new ApiError("INVALID_STATE", "El proyecto cambió mientras decidías");
    await tx.update(schema.submissions).set({
      client_decision: input.decision === "approve" ? "approved" : "changes_requested",
      client_feedback: input.feedback ?? null,
      updated_at: new Date(),
    }).where(eq(schema.submissions.id, submission.id));
    // Pedir cambios no aprueba ni rechaza en Terac: el mismo profesional usa el portal.
    // Un trabajo adicional de pago requiere otra cotización y aprobación explícita.
  });
  runInBackground("client_decision", () =>
    runAgentTurn(project.id, { type: "client_decision", decision: input.decision, feedback: input.feedback }),
  );
  return c.json({ ok: true }, 202);
});

projectRoutes.post("/projects/:id/submissions/:sid/review", async (c) => {
  const project = await getOwnedProject(c.req.param("id"), c.get("userId"));
  const opportunity = await db().query.teracOpportunities.findFirst({ where: eq(schema.teracOpportunities.project_id, project.id) });
  const submission = opportunity ? await db().query.submissions.findFirst({ where: and(
    eq(schema.submissions.id, c.req.param("sid")), eq(schema.submissions.opportunity_id, opportunity.id),
  ) }) : undefined;
  if (!submission) throw new ApiError("NOT_FOUND", "Entrega no encontrada");
  runInBackground("retry_submission_review", () => reviewPendingSubmission(submission.id));
  return c.json({ ok: true }, 202);
});
