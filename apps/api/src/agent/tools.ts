import { dynamicTool, type ToolSet } from "ai";
import { BriefSchema, type Brief, type ProjectStatus } from "@bc/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client";
import type { Project } from "../db/schema";
import { env, required } from "../env";
import { deliveryPortalUrl } from "../lib/delivery-token";
import { signedDownloadUrl } from "../lib/storage";
import { addMessage, requireStatus, transition } from "../services/projects";
import { terac } from "../terac/client";
import { filtersFor } from "../terac/filters";
import { assertPaymentCanFundWork } from "../services/demo-payments";
import { ensureProjectTasks } from "../services/workspace";

// Herramientas del agente (doc 03). Cada una declara en qué estados está
// disponible y el servidor lo vuelve a comprobar al ejecutarla: el modelo
// puede pedir una acción, pero solo el servidor decide si se hace.

export type ToolContext = { project: Project; userId: string; clientLanguage: string };

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  statuses: readonly ProjectStatus[];
  input: S;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
};

const defineTool = <S extends z.ZodType>(def: ToolDef<S>) => def;

const ALL: readonly ProjectStatus[] = [
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
];

const askClient = defineTool({
  name: "ask_client",
  description:
    "Envía al cliente una pregunta con botones de respuesta rápida. Úsala cuando haya opciones claras (barrio, público, tono…). Escribe en el idioma del cliente.",
  statuses: ALL,
  input: z.object({
    question: z.string().min(1).describe("Pregunta para el cliente, en su idioma"),
    options: z.array(z.string().min(1).max(60)).min(2).max(6).describe("Respuestas rápidas sugeridas"),
  }),
  async run(ctx, input) {
    await addMessage({
      projectId: ctx.project.id,
      userId: ctx.userId,
      role: "assistant",
      content: input.question,
      language: ctx.clientLanguage,
      card: { type: "quick_replies", options: input.options },
    });
    return { sent: true };
  },
});

const saveBrief = defineTool({
  name: "save_brief",
  description:
    "Guarda o actualiza el brief estructurado y lo muestra al cliente para que lo confirme. Los textos descriptivos del brief van en el idioma del cliente; los idiomas son códigos BCP-47.",
  statuses: ["intake", "brief_ready"],
  input: z.object({ brief: BriefSchema, summary: z.string().min(1).describe("Resumen breve para el cliente, en su idioma") }),
  async run(ctx, { brief, summary }) {
    if (ctx.project.brief_confirmed) throw new Error("El alcance ya fue aprobado. Conserva este proyecto; usa suggest_new_project para otro servicio y ask_client para aclaraciones del mismo encargo.");
    // Refining a pre-payment plan rebuilds its tasks after the client's next confirmation.
    if (JSON.stringify(ctx.project.brief) !== JSON.stringify(brief)) {
      await db().delete(schema.projectTasks).where(eq(schema.projectTasks.project_id, ctx.project.id));
    }
    await transition(ctx.project.id, ctx.project.status, "brief_ready", {
      brief,
      brief_confirmed: false,
      target_language: brief.target_language,
      target_market: brief.target_market,
    });
    await addMessage({
      projectId: ctx.project.id,
      userId: ctx.userId,
      role: "assistant",
      content: summary,
      language: ctx.clientLanguage,
      card: { type: "brief", brief },
    });
    return { saved: true, status: "brief_ready", next: "Pide al cliente que confirme el brief con el botón." };
  },
});

function feasibilityFromBrief(brief: Brief) {
  const market = [brief.target_market.city, brief.target_market.region, brief.target_market.country]
    .filter(Boolean)
    .join(", ");
  return {
    taskDescription: [
      `Adaptación cultural y comercial (${brief.deliverable_type}) de ${brief.source_language} a ${brief.target_language}.`,
      `Negocio: ${brief.business.name} (${brief.business.sector}). Oferta: ${brief.business.offer}.`,
      `Objetivo: ${brief.goal}`,
      `Entregables: ${brief.deliverables.join("; ")}.`,
      `Criterios de aceptación: ${brief.acceptance_criteria.join("; ")}.`,
      "El profesional entrega archivos con los textos adaptados y notas culturales que expliquen cada cambio.",
    ].join("\n"),
    panelDescription: [
      `Perfil: ${brief.professional_profile}.`,
      `Debe dominar ${brief.target_language} a nivel nativo y conocer el mercado de ${market}.`,
      `Público objetivo del negocio: ${brief.audience}.`,
    ].join("\n"),
    submissionCount: 1,
    timelineHours: (brief.deadline_days ?? 7) * 24,
    payRateFrequency: "ONE_TIME" as const,
  };
}

const requestQuote = defineTool({
  name: "request_quote",
  description: "Pide a Terac una cotización para el brief confirmado. Solo funciona si el cliente ya confirmó el brief.",
  statuses: ["brief_ready"],
  input: z.object({}),
  async run(ctx) {
    if (!ctx.project.brief_confirmed || !ctx.project.brief) {
      throw new Error("El cliente todavía no confirmó el brief.");
    }
    const existing = await db().query.quotes.findFirst({
      where: and(eq(schema.quotes.project_id, ctx.project.id), inArray(schema.quotes.status, ["requested", "priced"])),
    });
    if (!existing) {
      const fr = await terac.requestFeasibility(feasibilityFromBrief(ctx.project.brief));
      await db().insert(schema.quotes).values({
        project_id: ctx.project.id,
        terac_feasibility_request_id: fr.id,
        status: "requested",
      });
    }
    await ensureProjectTasks(ctx.project);
    await transition(ctx.project.id, "brief_ready", "quoting");
    return {
      status: "quoting",
      note: "Una persona de Terac fija el precio; puede tardar. Avisaremos al cliente cuando esté listo.",
    };
  },
});

const presentQuote = defineTool({
  name: "present_quote",
  description: "Muestra al cliente la tarjeta de cotización (precio final ya calculado por el servidor, plazo y qué incluye).",
  statuses: ["quoted"],
  input: z.object({
    includes: z.array(z.string().min(1)).min(1).max(6).describe("Qué incluye el trabajo, en el idioma del cliente"),
    message: z.string().min(1).describe("Mensaje breve que acompaña a la tarjeta, en el idioma del cliente"),
  }),
  async run(ctx, input) {
    const quote = await db().query.quotes.findFirst({
      where: and(eq(schema.quotes.project_id, ctx.project.id), eq(schema.quotes.status, "priced")),
      orderBy: desc(schema.quotes.created_at),
    });
    if (!quote?.total_usd) throw new Error("No hay una cotización con precio para este proyecto.");
    await addMessage({
      projectId: ctx.project.id,
      userId: ctx.userId,
      role: "assistant",
      content: input.message,
      language: ctx.clientLanguage,
      card: { type: "quote", quote_id: quote.id, total_usd: quote.total_usd, eta_days: quote.eta_days, includes: input.includes },
    });
    return { shown: true, total_usd: quote.total_usd, eta_days: quote.eta_days };
  },
});

async function requireSucceededPayment(projectId: string) {
  const paid = await db().query.payments.findFirst({
    where: and(eq(schema.payments.project_id, projectId), eq(schema.payments.status, "succeeded")),
  });
  if (!paid) throw new Error("No hay un pago confirmado para este proyecto. No se puede contratar.");
  assertPaymentCanFundWork(paid);
  return paid;
}

async function opportunityBody(project: Project, feasibilityRequestId: string) {
  const brief = project.brief!;
  const uploads = brief.asset_ids.length
    ? await db().query.assets.findMany({
        where: and(eq(schema.assets.project_id, project.id), inArray(schema.assets.id, brief.asset_ids)),
      })
    : [];
  const links = await Promise.all(
    uploads.map(async (a) => `- ${a.filename}: ${await signedDownloadUrl(env().STORAGE_BUCKET_UPLOADS, a.storage_path, 7 * 24 * 3600)}`),
  );
  const filters = filtersFor(brief);
  return {
    project_id: env().TERAC_MODE === "replay" ? "replay_project" : required("TERAC_PROJECT_ID"),
    title: `Adaptación cultural: ${brief.business.sector} (${brief.source_language} → ${brief.target_language})`.slice(0, 200),
    internal_title: `bc_${project.id}`,
    description: [
      `Negocio: ${brief.business.name} — ${brief.business.offer}`,
      `Objetivo: ${brief.goal}`,
      `Mercado: ${[brief.target_market.city, brief.target_market.region, brief.target_market.country].filter(Boolean).join(", ")}`,
      `Público: ${brief.audience}`,
      `Notas culturales: ${brief.cultural_notes.join("; ") || "—"}`,
      `Criterios de aceptación: ${brief.acceptance_criteria.join("; ")}`,
    ].join("\n"),
    num_participants: 1,
    business_type: "b2b" as const,
    customer_screening_review: "auto_invite" as const,
    expected_days_to_complete: Math.max(5, brief.deadline_days ?? 7),
    feasibility_request_id: feasibilityRequestId,
    ...(filters.length ? { filters } : { unrestricted_audience: true }),
    screening_questions: [
      { text: `Describe una campaña que hayas adaptado para el público de ${brief.target_market.city ?? brief.target_market.country}.`, pick: "text" as const },
    ],
    tasks: [
      {
        sequence: 1,
        task_type: "interview" as const,
        task_url: await deliveryPortalUrl(project.id),
        review_type: "manual_review" as const,
        title: "Entrega de la adaptación",
        instructions: [
          "Desde el portal también puedes enviar mensajes al cliente, proponer o confirmar llamadas y compartir enlaces de Google Meet, Zoom o Teams. Reabre el portal para leer sus respuestas; BilingualCheck le avisará dentro de la app.",
          "Abre la página de entrega para ver el brief y enviar los textos adaptados con las notas culturales. Tras enviarlos, vuelve a Terac y marca la tarea como terminada. La aprobación y el pago requieren la decisión del cliente.",
          "Materiales del cliente (enlaces válidos 7 días):",
          links.join("\n") || "- (sin archivos; usa la descripción)",
          `Entrega: ${brief.deliverables.join("; ")}. Incluye notas culturales que expliquen cada cambio y recomendaciones adicionales.`,
        ].join("\n").slice(0, 4000),
      },
    ],
  };
}

const createOpportunity = defineTool({
  name: "create_opportunity",
  description: "Crea en Terac el borrador del trabajo a partir del brief. Exige un pago confirmado por el servidor.",
  statuses: ["paid"],
  input: z.object({}),
  async run(ctx) {
    await requireSucceededPayment(ctx.project.id);
    const existing = await db().query.teracOpportunities.findFirst({
      where: eq(schema.teracOpportunities.project_id, ctx.project.id),
    });
    if (existing) return { opportunity_id: existing.id, status: existing.status, reused: true };

    const quote = await db().query.quotes.findFirst({
      where: and(eq(schema.quotes.project_id, ctx.project.id), eq(schema.quotes.status, "accepted")),
    });
    if (!quote) throw new Error("No hay una cotización aceptada.");

    // Antes de reintentar un POST, comprobar que no se creó ya (doc 02 · Idempotencia).
    const body = await opportunityBody(ctx.project, quote.terac_feasibility_request_id);
    const opp = (await terac.findOpportunityByInternalTitle(body.internal_title)) ?? (await terac.createOpportunity(body));
    const [row] = await db()
      .insert(schema.teracOpportunities)
      .values({ project_id: ctx.project.id, terac_opportunity_id: opp.id, status: opp.status })
      .returning();
    return { opportunity_id: row!.id, status: opp.status };
  },
});

const launchOpportunity = defineTool({
  name: "launch_opportunity",
  description: "Lanza en Terac el trabajo creado para que empiece la búsqueda del profesional. Exige un pago confirmado.",
  statuses: ["paid"],
  input: z.object({}),
  async run(ctx) {
    await requireSucceededPayment(ctx.project.id);
    const opp = await db().query.teracOpportunities.findFirst({
      where: eq(schema.teracOpportunities.project_id, ctx.project.id),
    });
    if (!opp) throw new Error("Primero hay que crear la oportunidad con create_opportunity.");
    const launched = opp.status === "draft" ? await terac.launchOpportunity(opp.terac_opportunity_id) : opp;
    await db()
      .update(schema.teracOpportunities)
      .set({ status: launched.status })
      .where(eq(schema.teracOpportunities.id, opp.id));
    await transition(ctx.project.id, "paid", "recruiting");
    return { status: "recruiting" };
  },
});

const recommendFollowup = defineTool({
  name: "recommend_followup",
  description: "Sugiere al cliente otro trabajo útil (p. ej. adaptar también su web). Es solo una sugerencia.",
  statuses: ["delivered"],
  input: z.object({ text: z.string().min(1).describe("Recomendación en el idioma del cliente") }),
  async run(ctx, input) {
    await addMessage({
      projectId: ctx.project.id,
      userId: ctx.userId,
      role: "assistant",
      content: input.text,
      language: ctx.clientLanguage,
      card: { type: "recommendation", text: input.text },
    });
    return { sent: true };
  },
});

const suggestNewProject = defineTool({
  name: "suggest_new_project",
  description: "Sugiere abrir otro proyecto cuando el cliente solicita un servicio diferente del alcance ya aprobado o cotizado (por ejemplo, cambiar una campaña de Meta por un website). No altera el proyecto actual, no crea proyectos, no contrata y no cobra. El cliente decide con un botón.",
  statuses: ["brief_ready", "quoting", "quoted", "awaiting_payment", "paid", "recruiting", "in_progress", "in_review", "revision", "delivered"],
  input: z.object({ goal: z.string().trim().min(1).max(8000).describe("Nueva necesidad en el idioma del cliente"),
    reason: z.string().trim().min(1).max(2000).describe("Explica en el idioma del cliente por qué hacen falta otro proyecto, profesional y cotización") }),
  async run(ctx, { goal, reason }) {
    await addMessage({ projectId: ctx.project.id, userId: ctx.userId, role: "assistant", language: ctx.clientLanguage,
      content: reason, card: { type: "new_project", goal, reason } });
    return { suggested: true, current_project_unchanged: true };
  },
});

export const TOOLS = [
  askClient,
  saveBrief,
  requestQuote,
  presentQuote,
  createOpportunity,
  launchOpportunity,
  recommendFollowup,
  suggestNewProject,
] as const;

const byName = new Map<string, ToolDef<z.ZodType>>(TOOLS.map((t) => [t.name, t as unknown as ToolDef<z.ZodType>]));

/** Solo se ofrecen las herramientas disponibles en el estado actual. */
export function toolsForStatus(status: ProjectStatus): ToolSet {
  return Object.fromEntries(TOOLS.filter((t) => t.statuses.includes(status)).map((t) => [
    t.name, dynamicTool({ description: t.description, inputSchema: t.input }),
  ]));
}

/**
 * Ejecuta una herramienta pedida por el modelo. Revalida estado y argumentos
 * contra el proyecto recién leído de la base de datos.
 */
export async function executeTool(name: string, rawInput: unknown, ctx: Omit<ToolContext, "project"> & { projectId: string }) {
  const tool = byName.get(name);
  if (!tool) throw new Error(`Herramienta desconocida: ${name}`);
  const project = await db().query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
  if (!project) throw new Error("Proyecto no encontrado");
  requireStatus(project.status, tool.statuses, `usar ${name}`);
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(`Argumentos inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return tool.run({ ...ctx, project }, parsed.data);
}
