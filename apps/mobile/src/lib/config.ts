// Variables públicas (EXPO_PUBLIC_*). Ningún secreto vive en la app.
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  whopClientId: process.env.EXPO_PUBLIC_WHOP_CLIENT_ID ?? "",
  whopOAuthBase:
    process.env.EXPO_PUBLIC_WHOP_ENV === "production" ? "https://api.whop.com" : "https://sandbox-api.whop.com",
};

export const whopNativeReturnUri = "bilingualcheck://auth/callback";
export const whopNativeOAuthRedirectUri = () => new URL("/v1/auth/whop/callback/native", config.apiUrl).href;

const OAUTH_STORAGE_KEY = "bc.whop.oauth.v1";
const OAUTH_MAX_AGE_MS = 10 * 60_000;
export type WhopOAuthCode = { code: string; code_verifier: string; redirect_uri: string };
type PendingOAuth = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  oauthBase: string;
  createdAt: number;
};

/** Navegación web completa: conserva PKCE solo en la pestaña que inicia OAuth. */
export function startWhopWebOAuth(request: { url: string | null; state: string; codeVerifier?: string; redirectUri: string }) {
  if (!request.url || !request.codeVerifier) throw new Error("OAuth no está listo");
  const expected = new URL("/auth/callback", window.location.origin).href;
  if (request.redirectUri !== expected) throw new Error("Callback OAuth inesperado");
  const pending: PendingOAuth = {
    state: request.state,
    codeVerifier: request.codeVerifier,
    redirectUri: request.redirectUri,
    clientId: config.whopClientId,
    oauthBase: config.whopOAuthBase,
    createdAt: Date.now(),
  };
  window.sessionStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(pending));
  window.location.assign(request.url);
}

/** Consume la transacción antes del intercambio: no se puede reutilizar al recargar. */
export function consumeWhopWebOAuth(callbackUrl: string): WhopOAuthCode {
  const raw = window.sessionStorage.getItem(OAUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_STORAGE_KEY);
  const url = new URL(callbackUrl);
  // Elimina code/state incluso cuando el callback es inválido o el usuario deniega acceso.
  window.history.replaceState(null, "", url.pathname);
  const stored: unknown = raw ? JSON.parse(raw) : null;
  if (!stored || typeof stored !== "object") throw new Error("No hay una sesión OAuth pendiente");
  const pending = stored as Partial<PendingOAuth>;
  const age = typeof pending.createdAt === "number" ? Date.now() - pending.createdAt : Infinity;
  if (
    typeof pending.state !== "string" || !pending.state ||
    pending.state !== url.searchParams.get("state") ||
    typeof pending.codeVerifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(pending.codeVerifier) ||
    pending.redirectUri !== new URL("/auth/callback", window.location.origin).href ||
    `${url.origin}${url.pathname}` !== pending.redirectUri || url.hash ||
    pending.clientId !== config.whopClientId || pending.oauthBase !== config.whopOAuthBase ||
    age < 0 || age > OAUTH_MAX_AGE_MS
  ) throw new Error("La sesión OAuth no es válida o ha caducado");
  for (const key of ["code", "state", "error"]) {
    if (url.searchParams.getAll(key).length > 1) throw new Error("Respuesta OAuth ambigua");
  }
  if (url.searchParams.has("error")) throw new Error("Whop no autorizó el inicio de sesión");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) throw new Error("Whop no devolvió un código válido");
  return { code, code_verifier: pending.codeVerifier, redirect_uri: pending.redirectUri };
}
