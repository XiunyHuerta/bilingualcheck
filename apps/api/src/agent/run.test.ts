import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), execute: vi.fn(), addMessage: vi.fn(),
  insert: vi.fn(), lock: vi.fn(), update: vi.fn(), history: vi.fn(), settings: { AGENT_MODEL: "gemini-3.6-flash", AGENT_MAX_TOOL_CALLS: 2 } }));
vi.mock("ai", async (original) => ({ ...await original<typeof import("ai")>(), generateText: mocks.generate }));
vi.mock("./model", () => ({ geminiModel: () => "gemini-test", geminiOptions: {} }));
vi.mock("./tools", () => ({ toolsForStatus: () => ({}), executeTool: mocks.execute }));
vi.mock("../env", () => ({ env: () => mocks.settings }));
vi.mock("../services/projects", () => ({ addMessage: mocks.addMessage }));
vi.mock("../lib/storage", () => ({ download: vi.fn() }));
vi.mock("../db/client", async (original) => ({ ...await original<typeof import("../db/client")>(), db: () => ({
  query: { users: { findFirst: async () => ({ business_name: "Example business", business_profile: null }) },
    projects: { findFirst: async () => ({ id: "p", user_id: "u", status: "intake", source_language: "es" }) },
    messages: { findMany: mocks.history, findFirst: async () => undefined } },
  update: mocks.update, insert: () => ({ values: mocks.insert }),
}) }));
import { runAgentTurn } from "./run";

const response = (overrides = {}) => ({ text: "Hola, cuéntame sobre tu negocio.", finishReason: "stop",
  usage: { inputTokens: 15, outputTokens: 8 }, toolCalls: [], responseMessages: [], ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.AGENT_MAX_TOOL_CALLS = 2;
  mocks.lock.mockResolvedValue([{ id: "p" }]);
  mocks.update.mockImplementation(() => ({ set: () => ({ where: () => ({ returning: mocks.lock }) }) }));
  mocks.history.mockResolvedValue([{ role: "system_event", content: "agent_error" }, { role: "user", content: "Hola" }]);
  mocks.generate.mockResolvedValue(response());
});

describe("agente Gemini", () => {
  it("guarda la respuesta y consumo, excluyendo fallos anteriores del contexto", async () => {
    await runAgentTurn("p", { type: "user_message" });
    expect(mocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "assistant", content: response().text }));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.6-flash", input_tokens: 15, output_tokens: 8, error: null }));
    expect(mocks.generate.mock.calls[0]![0].messages).toEqual([{ role: "user", content: [{ type: "text", text: "Hola" }] }]);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it("conserva firmas y devuelve errores de herramientas al modelo para corregirlos", async () => {
    const signed = { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "ask_client", input: {},
      providerOptions: { google: { thoughtSignature: "signature" } } }] };
    mocks.generate.mockResolvedValueOnce(response({ text: "", toolCalls: [{ toolCallId: "c1", toolName: "ask_client", input: {} }], responseMessages: [signed] }));
    mocks.execute.mockRejectedValueOnce(new Error("Argumentos inválidos"));
    await runAgentTurn("p", { type: "user_message" });
    expect(mocks.execute).toHaveBeenCalledWith("ask_client", {}, { projectId: "p", userId: "u", clientLanguage: "es" });
    expect(mocks.generate.mock.calls[1]![0].messages).toEqual(expect.arrayContaining([signed, { role: "tool", content: [
      { type: "tool-result", toolCallId: "c1", toolName: "ask_client", output: { type: "error-text", value: "Argumentos inválidos" } },
    ] }]));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ tool_calls: [expect.objectContaining({ ok: false })] }));
  });

  it("no ejecuta un lote de herramientas que excede el límite", async () => {
    mocks.settings.AGENT_MAX_TOOL_CALLS = 1;
    mocks.generate.mockResolvedValueOnce(response({ text: "", toolCalls: [{ toolCallId: "a", toolName: "ask_client", input: {} }, { toolCallId: "b", toolName: "ask_client", input: {} }] }));
    await runAgentTurn("p", { type: "user_message" });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "system_event", content: "agent_error" }));
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it("registra fallos del proveedor y libera el proyecto para reintentar", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Gemini unavailable"));
    await runAgentTurn("p", { type: "user_message" });
    expect(mocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({ content: "agent_error" }));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ error: "Gemini unavailable" }));
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
});
