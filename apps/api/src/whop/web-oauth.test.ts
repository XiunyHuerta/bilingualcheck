import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, consumeWhopWebOAuth, startWhopWebOAuth } from "../../../mobile/src/lib/config";

const callback = "https://bilingualcheck-app.vercel.app/auth/callback";
const request = {
  url: "https://sandbox-api.whop.com/oauth/authorize?state=mock-state",
  state: "mock-state", codeVerifier: "v".repeat(43), redirectUri: callback,
};
let storage: Map<string, string>;
const assign = vi.fn();
const replaceState = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  storage = new Map();
  vi.stubGlobal("window", {
    location: { origin: "https://bilingualcheck-app.vercel.app", assign },
    history: { replaceState },
    sessionStorage: {
      setItem: (key: string, value: string) => storage.set(key, value),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
    },
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("OAuth web con almacenamiento y navegación mock", () => {
  it("sobrevive a navegación completa y consume exactamente el PKCE iniciado", () => {
    startWhopWebOAuth(request);
    expect(assign).toHaveBeenCalledWith(request.url);
    expect(storage.size).toBe(1);
    expect(consumeWhopWebOAuth(`${callback}?code=mock-code&state=mock-state`)).toEqual({
      code: "mock-code", code_verifier: request.codeVerifier, redirect_uri: callback,
    });
    expect(storage.size).toBe(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/auth/callback");
    expect(() => consumeWhopWebOAuth(`${callback}?code=mock-code&state=mock-state`)).toThrow();
  });

  it.each([
    "code=mock-code&state=attacker", "state=mock-state", "error=access_denied&state=mock-state",
    "code=x&code=y&state=mock-state", "code=x&state=mock-state&state=other", "code=x&state=mock-state#token=bad",
  ])("rechaza %s y elimina estado y código de la URL", (query) => {
    startWhopWebOAuth(request);
    expect(() => consumeWhopWebOAuth(`${callback}?${query}`)).toThrow();
    expect(storage.size).toBe(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/auth/callback");
  });

  it("rechaza acceso directo sin transacción pendiente", () => {
    expect(() => consumeWhopWebOAuth(`${callback}?code=x&state=s`)).toThrow();
  });

  it("caduca la transacción tras diez minutos", () => {
    vi.useFakeTimers();
    startWhopWebOAuth(request);
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1);
    expect(() => consumeWhopWebOAuth(`${callback}?code=x&state=mock-state`)).toThrow();
  });

  it("rechaza fechas futuras", () => {
    vi.useFakeTimers();
    startWhopWebOAuth(request);
    vi.setSystemTime(Date.now() - 1);
    expect(() => consumeWhopWebOAuth(`${callback}?code=x&state=mock-state`)).toThrow();
  });

  it.each(["clientId", "oauthBase", "redirectUri", "codeVerifier"])("rechaza una transacción con %s inesperado", (field) => {
    startWhopWebOAuth(request);
    const [key, value] = [...storage.entries()][0]!;
    const pending = JSON.parse(value);
    pending[field] = "invalid";
    storage.set(key, JSON.stringify(pending));
    expect(() => consumeWhopWebOAuth(`${callback}?code=x&state=mock-state`)).toThrow();
  });

  it("rechaza JSON corrupto y lo elimina", () => {
    startWhopWebOAuth(request);
    storage.set([...storage.keys()][0]!, "{");
    expect(() => consumeWhopWebOAuth(`${callback}?code=x&state=mock-state`)).toThrow();
    expect(storage.size).toBe(0);
  });

  it("no navega si el almacenamiento está bloqueado", () => {
    window.sessionStorage.setItem = () => { throw new Error("blocked"); };
    expect(() => startWhopWebOAuth(request)).toThrow();
    expect(assign).not.toHaveBeenCalled();
  });

  it("no inicia OAuth sin PKCE ni con callback de otro origen", () => {
    expect(() => startWhopWebOAuth({ ...request, codeVerifier: undefined })).toThrow();
    expect(() => startWhopWebOAuth({ ...request, redirectUri: "https://evil.test/auth/callback" })).toThrow();
    expect(assign).not.toHaveBeenCalled();
  });

  it("el estado temporal no contiene tokens ni secretos de Whop", () => {
    startWhopWebOAuth(request);
    expect(JSON.parse([...storage.values()][0]!)).toMatchObject({ clientId: config.whopClientId, oauthBase: config.whopOAuthBase });
    expect([...storage.values()][0]).not.toMatch(/access_token|refresh_token|client_secret|session_jwt/);
  });
});
