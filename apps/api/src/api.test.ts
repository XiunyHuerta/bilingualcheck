import { createHmac } from "node:crypto";
import type { Brief } from "@bc/shared";
import { describe, expect, it } from "vitest";
import { toolsForStatus } from "./agent/tools";
import { app } from "./app";
import { ConfigError, teracApiKey, teracEnv } from "./env";
import { filtersFor, PLAIN_LANGUAGE_IDS, teracLanguageId } from "./terac/filters";
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

describe("configuración de Terac", () => {
  const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
    const saved = { ...process.env };
    for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    try {
      fn();
    } finally {
      process.env = saved;
    }
  };

  it("los scripts de Terac no exigen Supabase ni Whop", () => {
    withEnv({ SESSION_JWT_SECRET: undefined, DATABASE_URL: undefined, TERAC_API_KEY: "k", TERAC_MODE: "live" }, () => {
      expect(teracEnv()).toMatchObject({ TERAC_MODE: "live", TERAC_API_KEY: "k" });
      expect(teracApiKey()).toBe("k");
    });
  });

  it("sin API key avisa qué variable falta", () => {
    withEnv({ TERAC_API_KEY: undefined }, () => {
      expect(() => teracApiKey()).toThrow(ConfigError);
      try {
        teracApiKey();
      } catch (e) {
        expect((e as ConfigError).missing).toEqual(["TERAC_API_KEY"]);
      }
    });
  });
});

describe("filtros de Terac", () => {
  const brief = (country: string, target = "en") => ({ target_language: target, target_market: { country } }) as unknown as Brief;

  it("filtra por país (código ISO del brief) y por idioma principal", () => {
    expect(filtersFor(brief("us"))).toEqual([{ "multi_select--country": { $in: ["US"] } }, { "multi_select--language": { $in: ["en-US"] } }]);
  });
  it("sin código ISO no filtra por país en vez de fallar en Terac", () => {
    expect(filtersFor(brief("Estados Unidos", "ko"))).toEqual([{ "multi_select--language": { $in: ["ko-KR"] } }]);
  });
  it("un idioma que Terac no tiene no añade filtro", () => {
    expect(filtersFor(brief("US", "xx"))).toEqual([{ "multi_select--country": { $in: ["US"] } }]);
  });
  it("traduce etiquetas BCP-47 a los IDs de idioma de Terac", () => {
    expect(teracLanguageId("pt-BR")).toBe("pt-BR");
    expect(teracLanguageId("es-MX")).toBe("es-ES");
    expect(teracLanguageId("ht")).toBe("ht");
    expect(teracLanguageId("tl")).toBe("fil");
    expect(teracLanguageId("yue")).toBe("yue");
  });
  it("la tabla de idiomas coincide con las 184 opciones de Terac", () => {
    expect(20 + PLAIN_LANGUAGE_IDS.size).toBe(184);
  });
});
