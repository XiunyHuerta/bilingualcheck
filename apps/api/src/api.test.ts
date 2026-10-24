import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toolsForStatus } from "./agent/tools";
import { app } from "./app";
import { replay } from "./terac/replay";
import { verifyTeracSignature } from "./terac/webhook";

describe("GET /health", () => {
  it("responde sin depender de claves externas", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("las rutas /v1 exigen sesión", async () => {
    const res = await app.request("/v1/projects");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });
});

describe("firma de webhooks de Terac", () => {
  const secret = "test-secret";
  const body = '{"type":"submission.status.change"}';
  const ts = "1700000000";
  const sig = createHmac("sha256", secret).update(ts + body).digest("base64");

  it("acepta una firma válida", () => {
    expect(verifyTeracSignature({ timestamp: ts, signature: sig, rawBody: body, secret, nowSeconds: 1700000010 })).toEqual({ ok: true });
  });
  it("rechaza cuerpos alterados", () => {
    expect(verifyTeracSignature({ timestamp: ts, signature: sig, rawBody: body + " ", secret, nowSeconds: 1700000010 })).toMatchObject({ ok: false, reason: "bad_signature" });
  });
  it("rechaza timestamps de más de 300 s", () => {
    expect(verifyTeracSignature({ timestamp: ts, signature: sig, rawBody: body, secret, nowSeconds: 1700000400 })).toMatchObject({ ok: false, reason: "stale" });
  });
});

describe("Terac en modo replay", () => {
  it("la cotización pasa de RECEIVED a RESPONDED con el tiempo", () => {
    const fresh = replay.requestFeasibility({ taskDescription: "x", panelDescription: "y" });
    expect(replay.getFeasibility(fresh.id).status).toBe("RECEIVED");
    const old = replay.getFeasibility(`replay_fr_${Date.now() - 60_000}`);
    expect(old).toMatchObject({ status: "RESPONDED", costPerParticipant: "84.00" });
  });
});

describe("herramientas por estado", () => {
  const names = (s: Parameters<typeof toolsForStatus>[0]) => toolsForStatus(s).map((t) => t.name);
  it("solo se puede contratar después de pagar", () => {
    expect(names("quoted")).not.toContain("create_opportunity");
    expect(names("awaiting_payment")).not.toContain("launch_opportunity");
    expect(names("paid")).toEqual(expect.arrayContaining(["create_opportunity", "launch_opportunity"]));
  });
  it("genera JSON Schema para Claude", () => {
    const brief = toolsForStatus("intake").find((t) => t.name === "save_brief");
    expect(brief?.input_schema).toMatchObject({ type: "object" });
  });
});
