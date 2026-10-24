import { z } from "zod";
import { ConfigError, env } from "../env";
import { ApiError } from "../lib/errors";

const CheckoutBody = z.object({ platform: z.enum(["web", "native"]).default("native") }).strict();

export function parseCheckoutRequestBody(text: string) {
  let raw: unknown = {};
  if (text.trim()) {
    try { raw = JSON.parse(text); } catch { throw new ApiError("VALIDATION_ERROR", "El cuerpo debe ser JSON"); }
  }
  const parsed = CheckoutBody.safeParse(raw);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Datos de checkout inválidos", parsed.error.issues);
  return parsed.data;
}

function httpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "URL de retorno inválida");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new ApiError("VALIDATION_ERROR", "El retorno requiere HTTPS (HTTP solo en loopback)");
  }
  return url;
}

export function webAppUrl(): URL {
  const value = env().WEB_APP_URL;
  if (!value) throw new ConfigError(["WEB_APP_URL"]);
  const url = httpUrl(value);
  if (url.pathname !== "/" || url.search || url.hash) throw new ConfigError(["WEB_APP_URL"]);
  return url;
}

export function nativeOAuthRedirectUri(): string {
  return new URL("/v1/auth/whop/callback/native", httpUrl(env().PUBLIC_API_URL)).href;
}

export function nativeAppReturnUri(path: "auth/callback" | "checkout/return"): string {
  const scheme = env().APP_SCHEME;
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme) || ["http", "https", "javascript", "data", "file", "exp"].includes(scheme.toLowerCase())) {
    throw new ConfigError(["APP_SCHEME"]);
  }
  return `${scheme}://${path}`;
}

/** Coincidencia exacta: sin comodines, query, fragmentos ni destinos del request. */
export function validateOAuthRedirectUri(value: string): string {
  if (value === nativeOAuthRedirectUri()) return value;
  if (value === new URL("/auth/callback", webAppUrl()).href) return value;
  throw new ApiError("VALIDATION_ERROR", "redirect_uri no está permitido");
}

export function checkoutReturnTo(platform: "web" | "native"): string {
  return platform === "web" ? new URL("/checkout/return", webAppUrl()).href : nativeAppReturnUri("checkout/return");
}

/** Destinos fijos del puente HTTP(S); parámetros de pago nunca acreditan el pago. */
export function checkoutAppReturnUrl(params: URLSearchParams): string {
  const platform = params.get("platform") ?? "web";
  const projectId = params.get("project_id");
  if (
    !["web", "native"].includes(platform) || params.getAll("platform").length > 1 ||
    params.getAll("project_id").length !== 1 ||
    !projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
  ) throw new ApiError("VALIDATION_ERROR", "Retorno de checkout inválido");
  const target = new URL(checkoutReturnTo(platform as "web" | "native"));
  target.searchParams.set("project_id", projectId);
  return target.href;
}

/** Whop recibe HTTP(S); el esquema nativo pasa por el puente HTTPS de la API. */
export function checkoutRedirectUrl(projectId: string, returnTo?: string): string {
  const webReturn = new URL("/checkout/return", webAppUrl()).href;
  const target = returnTo ?? webReturn;
  let url: URL;
  if (target === webReturn) {
    url = new URL(webReturn);
  } else if (target === nativeAppReturnUri("checkout/return")) {
    url = new URL("/checkout/return", httpUrl(env().PUBLIC_API_URL));
    url.searchParams.set("platform", "native");
  } else {
    throw new ApiError("VALIDATION_ERROR", "returnTo no está permitido");
  }
  url.searchParams.set("project_id", projectId);
  return url.href;
}

/** El puente no refleja destinos arbitrarios ni credenciales; solo la respuesta OAuth. */
export function nativeOAuthReturnUrl(params: URLSearchParams): string {
  const target = new URL(nativeAppReturnUri("auth/callback"));
  for (const key of ["code", "state", "error", "error_description"]) {
    const values = params.getAll(key);
    if (values.length > 1 || (values[0]?.length ?? 0) > 4096) {
      throw new ApiError("VALIDATION_ERROR", "Respuesta OAuth inválida");
    }
    if (values[0]) target.searchParams.set(key, values[0]);
  }
  if (!target.searchParams.get("state") || (!target.searchParams.get("code") && !target.searchParams.get("error"))) {
    throw new ApiError("VALIDATION_ERROR", "Respuesta OAuth incompleta");
  }
  return target.href;
}
