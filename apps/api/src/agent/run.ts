import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "../db/client";
import type { Message } from "../db/schema";
import { env } from "../env";
import { download } from "../lib/storage";
import { addMessage } from "../services/projects";
import { dynamicSystemPrompt, STATIC_SYSTEM_PROMPT } from "./prompt";
import { executeTool, toolsForStatus } from "./tools";

// Un turno del agente (doc 03): cargar contexto → Claude con herramientas →
// ejecutar herramientas en bucle → guardar mensajes, estado y traza.

export type AgentTrigger =
  | { type: "project_created" }
  | { type: "user_message" }
  | { type: "brief_confirmed" }
  | { type: "quote_ready" }
  | { type: "quote_unavailable" }
  | { type: "payment_succeeded" }
  | { type: "submission_received"; submissionId: string }
  | { type: "client_decision"; decision: "approve" | "request_changes"; feedback?: string };

const HISTORY_LIMIT = 30;
const MAX_TOKENS = 16_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

let anthropic: Anthropic | undefined;
const client = () => (anthropic ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY }));

const EVENT_TEXT: Record<AgentTrigger["type"], string> = {
  project_created: "El cliente acaba de crear el proyecto. Salúdalo y empieza la entrevista.",
  user_message: "",
  brief_confirmed: "El cliente confirmó el brief. Pide la cotización a Terac.",
  quote_ready: "Terac respondió con precio. Presenta la cotización.",
  quote_unavailable: "Terac no puede cubrir este proyecto (no hay profesionales disponibles). Explícalo al cliente.",
  payment_succeeded: "Whop confirmó el pago. Crea y lanza la oportunidad en Terac.",
  submission_received: "Llegó una entrega del profesional.",
  client_decision: "El cliente tomó una decisión sobre la entrega.",
};

function eventMessage(trigger: AgentTrigger): string {
  const extra = trigger.type === "client_decision" ? ` Decisión: ${trigger.decision}. ${trigger.feedback ?? ""}` : "";
  return `[Evento del servidor: ${trigger.type}] ${EVENT_TEXT[trigger.type]}${extra}`;
}

function describeCard(m: Message) {
  return m.card ? `\n[Se mostró al cliente una tarjeta de tipo "${m.card.type}"]` : "";
}

async function attachmentBlocks(m: Message): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  if (!m.asset_ids?.length) return [];
  const rows = await db().query.assets.findMany({
    where: and(eq(schema.assets.project_id, m.project_id), inArray(schema.assets.id, m.asset_ids), eq(schema.assets.uploaded, true)),
  });
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const a of rows) {
    const data = (await download(env().STORAGE_BUCKET_UPLOADS, a.storage_path)).toString("base64");
    if (IMAGE_TYPES.has(a.mime_type)) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: a.mime_type as "image/png", data },
      });
    } else if (a.mime_type === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: a.filename });
    }
  }
  return blocks;
}

/** Historial en formato de la API. Los archivos solo se adjuntan en el último mensaje del cliente. */
async function buildMessages(history: Message[], trigger: AgentTrigger): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  const lastUserIdx = history.findLastIndex((m) => m.role === "user");
  for (const [i, m] of history.entries()) {
    if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.content + describeCard(m) });
    } else if (m.role === "system_event") {
      out.push({ role: "user", content: `[Evento del servidor] ${m.content}` });
    } else {
      const files = i === lastUserIdx ? await attachmentBlocks(m) : [];
      out.push({ role: "user", content: [...files, { type: "text", text: m.content }] });
    }
  }
  if (trigger.type !== "user_message") out.push({ role: "user", content: eventMessage(trigger) });
  // La conversación debe empezar con un mensaje del cliente.
  if (out[0]?.role !== "user") out.unshift({ role: "user", content: eventMessage({ type: "project_created" }) });
  return out;
}

async function acquireLock(projectId: string) {
  const [row] = await db()
    .update(schema.projects)
    .set({ agent_busy: true })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.agent_busy, false)))
    .returning({ id: schema.projects.id });
  return Boolean(row);
}

const releaseLock = (projectId: string) =>
  db().update(schema.projects).set({ agent_busy: false }).where(eq(schema.projects.id, projectId));

export async function runAgentTurn(projectId: string, trigger: AgentTrigger): Promise<void> {
  if (!(await acquireLock(projectId))) return; // otro turno en curso; al terminar mirará si hay mensajes nuevos
  const startedAt = new Date();
  try {
    await turn(projectId, trigger);
  } finally {
    await releaseLock(projectId);
  }
  // Si el cliente escribió mientras el agente pensaba, responder ahora.
  const newer = await db().query.messages.findFirst({
    where: and(eq(schema.messages.project_id, projectId), eq(schema.messages.role, "user"), gt(schema.messages.created_at, startedAt)),
  });
  if (newer) await runAgentTurn(projectId, { type: "user_message" });
}

async function turn(projectId: string, trigger: AgentTrigger) {
  const e = env();
  const project = await db().query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project) return;
  const clientLanguage = project.source_language;

  const history = (
    await db().query.messages.findMany({
      where: eq(schema.messages.project_id, projectId),
      orderBy: desc(schema.messages.created_at),
      limit: HISTORY_LIMIT,
    })
  ).reverse();

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: STATIC_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: dynamicSystemPrompt({
        status: project.status,
        clientLanguage,
        briefConfirmed: project.brief_confirmed,
        brief: project.brief ?? null,
      }),
    },
  ];
  const tools = toolsForStatus(project.status);
  const messages = await buildMessages(history, trigger);
  const toolCalls: { name: string; input: unknown; result: unknown; ok: boolean }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let error: string | null = null;
  let finalText = "";

  try {
    for (;;) {
      const response = await client().beta.messages.create({
        model: e.AGENT_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools,
        messages,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      if (response.stop_reason === "refusal") {
        error = `refusal: ${response.stop_details?.category ?? "sin categoría"}`;
        break;
      }

      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) finalText = text;

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

      if (toolCalls.length + toolUses.length > e.AGENT_MAX_TOOL_CALLS) {
        error = `Se superó el límite de ${e.AGENT_MAX_TOOL_CALLS} herramientas por turno`;
        break;
      }

      // Se devuelve el contenido completo (incluidos los bloques de thinking) sin modificar.
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        try {
          const result = await executeTool(use.name, use.input, { projectId, userId: project.user_id, clientLanguage });
          toolCalls.push({ name: use.name, input: use.input, result, ok: true });
          results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toolCalls.push({ name: use.name, input: use.input, result: message, ok: false });
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: message });
        }
      }
      messages.push({ role: "user", content: results });
      finalText = ""; // solo se guarda el texto posterior a la última herramienta
    }
  } catch (err) {
    error = err instanceof Anthropic.APIError ? `Claude ${err.status}: ${err.message}` : String(err);
  }

  if (finalText) {
    await addMessage({ projectId, userId: project.user_id, role: "assistant", content: finalText, language: clientLanguage });
  } else if (error && toolCalls.length === 0) {
    await addMessage({
      projectId,
      userId: project.user_id,
      role: "system_event",
      content: "agent_error",
      language: clientLanguage,
    });
  }

  await db().insert(schema.agentRuns).values({
    project_id: projectId,
    trigger: trigger.type,
    model: e.AGENT_MODEL,
    tool_calls: toolCalls,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    error,
  });
  if (error) console.error(`[agent] proyecto ${projectId}: ${error}`);
}
