import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/errors";

const mocks = vi.hoisted(() => ({
  settings: {
    WHOP_ENV: "sandbox", WHOP_CLIENT_ID: "app_mock", WHOP_CLIENT_SECRET: undefined as string | undefined,
    WHOP_API_KEY: "mock-key", WHOP_ACCOUNT_ID: "biz_mock", WHOP_PRODUCT_ID: "prod_mock",
    WEB_APP_URL: "https://bilingualcheck-app.vercel.app", PUBLIC_API_URL: "https://bilingualcheck-api.vercel.app",
    APP_SCHEME: "bilingualcheck",
  },
  createCheckout: vi.fn(), insert: vi.fn(), values: vi.fn(), upsert: vi.fn(), returning: vi.fn(), signSession: vi.fn(),
}));

vi.mock("../env", async (original) => ({
  ...await original<typeof import("../env")>(),
  env: () => mocks.settings,
  required: (key: keyof typeof mocks.settings) => mocks.settings[key],
}));
vi.mock("@whop/sdk", () => ({
  WhopEnvironment: { Sandbox: "sandbox", Production: "production" },
  WhopClient: vi.fn(function () { return { checkoutConfigurations: { create: mocks.createCheckout } }; }),
}));
vi.mock("../db/client", () => ({
  db: () => ({ insert: mocks.insert }),
  schema: { users: { whop_user_id: "whop_user_id" } },
}));
vi.mock("../lib/session", async (original) => ({
  ...await original<typeof import("../lib/session")>(), signSession: mocks.signSession,
}));

import { authRoutes } from "../routes/auth";
import { createProjectCheckout, exchangeOAuthCode, revokeToken } from "./client";
import { checkoutAppReturnUrl, checkoutRedirectUrl, checkoutReturnTo, nativeOAuthReturnUrl, parseCheckoutRequestBody, validateOAuthRedirectUri } from "./redirects";

const redirect = "https://bilingualcheck-app.vercel.app/auth/callback";
const nativeRedirect = "https://bilingualcheck-api.vercel.app/v1/auth/whop/callback/native";
const oauth = { code: "mock-code", code_verifier: "v".repeat(43), redirect_uri: redirect };
const projectId = "ee792b6f-4265-485c-88de-d2bb1bc802b7";
const checkout = { projectId, quoteId: "quote-mock", totalUsd: 109.20, title: "Proyecto mock" };
const fetchMock = vi.fn<typeof fetch>();
const app = new Hono().route("/v1", authRoutes).onError((err, c) => {
  if (err instanceof ApiError) return c.json(err.toJSON(), err.status);
  throw err;
});

function successfulOAuth() {
  fetchMock.mockResolvedValueOnce(Response.json({ access_token: "mock-access", refresh_token: "mock-refresh" }))
    .mockResolvedValueOnce(Response.json({ sub: "user_mock", email: "mock@example.test", name: "Mock" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  mocks.settings.WHOP_ENV = "sandbox";
  mocks.settings.WHOP_CLIENT_SECRET = undefined;
  mocks.settings.WEB_APP_URL = "https://bilingualcheck-app.vercel.app";
  mocks.settings.APP_SCHEME = "bilingualcheck";
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.upsert });
  mocks.upsert.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: "local_mock", whop_user_id: "user_mock" }]);
  mocks.signSession.mockResolvedValue("mock-session-jwt");
  mocks.createCheckout.mockResolvedValue({ id: "ch_mock", plan: { id: "plan_mock" }, purchase_url: "https://sandbox.whop.com/checkout/ch_mock/" });
});
afterEach(() => vi.unstubAllGlobals());

describe("OAuth Whop sin red ni credenciales", () => {
  it.each(["sandbox", "production"])("intercambia JSON + PKCE y lee userinfo en %s", async (environment) => {
    mocks.settings.WHOP_ENV = environment;
    successfulOAuth();
    expect(await exchangeOAuthCode(oauth)).toMatchObject({ profile: { sub: "user_mock" }, refreshToken: "mock-refresh" });
    const host = environment === "sandbox" ? "https://sandbox-api.whop.com" : "https://api.whop.com";
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${host}/oauth/token`);
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(request?.body as string)).toEqual({ ...oauth, grant_type: "authorization_code", client_id: "app_mock" });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${host}/oauth/userinfo`);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({ Authorization: "Bearer mock-access" });
  });

  it("envía el secreto solo desde el backend cuando está configurado", async () => {
    mocks.settings.WHOP_CLIENT_SECRET = "mock-confidential-secret";
    successfulOAuth();
    await exchangeOAuthCode({ ...oauth, redirect_uri: nativeRedirect });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({ client_secret: "mock-confidential-secret", redirect_uri: nativeRedirect });
  });

  it("rechaza callbacks no permitidos antes de llamar a Whop", async () => {
    await expect(exchangeOAuthCode({ ...oauth, redirect_uri: "https://evil.test/auth/callback" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no filtra respuestas upstream con credenciales", async () => {
    fetchMock.mockResolvedValueOnce(new Response("sensitive-upstream-body", { status: 400 }));
    await expect(exchangeOAuthCode(oauth)).rejects.toMatchObject({ code: "UPSTREAM_WHOP", details: { status: 400 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["network", "json", "token", "profile", "userinfo"])("convierte errores %s en UPSTREAM_WHOP", async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
    if (failure === "json") fetchMock.mockResolvedValueOnce(new Response("not-json"));
    if (failure === "token") fetchMock.mockResolvedValueOnce(Response.json({ access_token: "" }));
    if (failure === "profile" || failure === "userinfo") {
      fetchMock.mockResolvedValueOnce(Response.json({ access_token: "mock-access" }));
      fetchMock.mockResolvedValueOnce(failure === "profile" ? Response.json({ sub: "" }) : new Response("denied", { status: 403 }));
    }
    await expect(exchangeOAuthCode(oauth)).rejects.toMatchObject({ code: "UPSTREAM_WHOP" });
  });

  it("revoca con JSON y comprueba el resultado", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await revokeToken("mock-refresh");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ token: "mock-refresh", client_id: "app_mock" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(revokeToken("mock-refresh")).rejects.toMatchObject({ code: "UPSTREAM_WHOP" });
  });

  it("POST /v1/auth/whop guarda el perfil y emite la sesión propia", async () => {
    successfulOAuth();
    const response = await app.request("/v1/auth/whop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(oauth) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ session_jwt: "mock-session-jwt", user: { id: "local_mock" } });
    expect(mocks.values).toHaveBeenCalledWith({ whop_user_id: "user_mock", email: "mock@example.test", name: "Mock" });
    expect(mocks.signSession).toHaveBeenCalledWith("local_mock");
  });

  it.each(["short", "v".repeat(129), "!".repeat(43)])("rechaza verifier inválido antes de tocar red/DB", async (code_verifier) => {
    const response = await app.request("/v1/auth/whop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...oauth, code_verifier }) });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("URIs exactas y puente nativo", () => {
  it.each([redirect, nativeRedirect])("acepta %s", (uri) => expect(validateOAuthRedirectUri(uri)).toBe(uri));
  it.each([
    "https://bilingualcheck-app.vercel.app.evil.test/auth/callback", "https://evil.test@bilingualcheck-app.vercel.app/auth/callback",
    `${redirect}?next=https://evil.test`, `${redirect}#fragment`, `${redirect}/`, "bilingualcheck://auth/callback",
    "javascript:alert(1)", "//bilingualcheck-app.vercel.app/auth/callback", "http://bilingualcheck-app.vercel.app/auth/callback",
  ])("rechaza %s", (uri) => expect(() => validateOAuthRedirectUri(uri)).toThrow(ApiError));

  it("permite HTTP únicamente para el origen loopback configurado", () => {
    mocks.settings.WEB_APP_URL = "http://localhost:8081";
    expect(validateOAuthRedirectUri("http://localhost:8081/auth/callback")).toContain("localhost:8081");
    expect(() => validateOAuthRedirectUri("http://localhost:3000/auth/callback")).toThrow(ApiError);
    mocks.settings.WEB_APP_URL = "http://192.168.1.5:8081";
    expect(() => validateOAuthRedirectUri("http://192.168.1.5:8081/auth/callback")).toThrow(ApiError);
  });

  it("el callback HTTPS solo redirige al esquema fijo, sin tokens ni next", async () => {
    const response = await app.request(`${nativeRedirect}?code=mock-code&state=mock-state&access_token=secret&next=https://evil.test`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("bilingualcheck://auth/callback?code=mock-code&state=mock-state");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it.each(["code=x", "state=s", "code=x&state=s&state=t", "error=access_denied"])("rechaza respuesta incompleta o ambigua %s", (query) => {
    expect(() => nativeOAuthReturnUrl(new URLSearchParams(query))).toThrow(ApiError);
  });
  it("devuelve denegaciones con state para que el cliente las verifique", () => {
    expect(nativeOAuthReturnUrl(new URLSearchParams({ error: "access_denied", state: "s" }))).toBe("bilingualcheck://auth/callback?state=s&error=access_denied");
  });
});

describe("checkout alojado", () => {
  it.each(["", "{}", "   "])("cuerpo anterior %s mantiene plataforma nativa", (raw) => {
    expect(parseCheckoutRequestBody(raw)).toEqual({ platform: "native" });
  });
  it.each(["web", "native"] as const)("el contrato elige el destino fijo %s", (platform) => {
    expect(parseCheckoutRequestBody(JSON.stringify({ platform }))).toEqual({ platform });
    expect(checkoutReturnTo(platform)).toBe(platform === "web" ? "https://bilingualcheck-app.vercel.app/checkout/return" : "bilingualcheck://checkout/return");
  });
  it.each(['{"platform":"evil"}', '{"returnTo":"https://evil.test"}', "null", "[]", "{"])("rechaza cuerpo de checkout %s", (raw) => {
    expect(() => parseCheckoutRequestBody(raw)).toThrow(ApiError);
  });
  it.each(["web", "native"])("el puente devuelve al destino %s y descarta status/next", (platform) => {
    const result = new URL(checkoutAppReturnUrl(new URLSearchParams({ platform, project_id: projectId, status: "paid", next: "https://evil.test" })));
    expect(`${result.protocol}//${result.host}${result.pathname}`).toBe(platform === "web" ? "https://bilingualcheck-app.vercel.app/checkout/return" : "bilingualcheck://checkout/return");
    expect([...result.searchParams.entries()]).toEqual([["project_id", projectId]]);
  });
  it("el puente sin plataforma vuelve a web", () => {
    expect(checkoutAppReturnUrl(new URLSearchParams({ project_id: projectId }))).toBe(`https://bilingualcheck-app.vercel.app/checkout/return?project_id=${projectId}`);
  });
  it.each([`project_id=${projectId}&platform=evil`, `project_id=${projectId}&platform=web&platform=native`, `project_id=${projectId}&project_id=${projectId}`, "platform=web", "project_id=bad"])("el puente rechaza %s", (query) => {
    expect(() => checkoutAppReturnUrl(new URLSearchParams(query))).toThrow(ApiError);
  });
  it("web vuelve directamente a la app, sin activar un esquema nativo", async () => {
    const result = await createProjectCheckout({ ...checkout, returnTo: "https://bilingualcheck-app.vercel.app/checkout/return" });
    expect(result).toEqual({ checkoutId: "ch_mock", variantId: "plan_mock", purchaseUrl: "https://sandbox.whop.com/checkout/ch_mock/" });
    expect(mocks.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      redirect_url: `https://bilingualcheck-app.vercel.app/checkout/return?project_id=${projectId}`,
      metadata: { project_id: projectId, quote_id: "quote-mock" },
      plan: expect.objectContaining({ initial_price: 109.20, plan_type: "one_time" }),
    }));
  });
  it("nativo usa el puente HTTP(S) de la API", async () => {
    await createProjectCheckout({ ...checkout, returnTo: "bilingualcheck://checkout/return" });
    expect(mocks.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      redirect_url: `https://bilingualcheck-api.vercel.app/checkout/return?platform=native&project_id=${projectId}`,
    }));
  });
  it("el retorno por defecto es web y codifica el id del proyecto", () => {
    const url = new URL(checkoutRedirectUrl("id&status=paid"));
    expect(url.searchParams.get("project_id")).toBe("id&status=paid");
    expect(url.searchParams.has("status")).toBe(false);
  });
  it.each(["https://evil.test/checkout/return", "bilingualcheck://checkout/return?next=evil", "https://bilingualcheck-app.vercel.app/checkout/return?status=paid"])("rechaza returnTo %s sin crear checkout", async (returnTo) => {
    await expect(createProjectCheckout({ ...checkout, returnTo })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });
  it("no devuelve una compra si Whop omite purchase_url", async () => {
    mocks.createCheckout.mockResolvedValueOnce({ id: "ch_mock" });
    await expect(createProjectCheckout(checkout)).rejects.toMatchObject({ code: "UPSTREAM_WHOP" });
  });
});
