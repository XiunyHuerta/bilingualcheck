import { jwtVerify, SignJWT } from "jose";
import { createMiddleware } from "hono/factory";
import { env } from "../env";
import { ApiError } from "./errors";

// Sesión propia de la API: JWT HS256, con role=authenticated y sub=users.id.
// Realtime solo puede reutilizarlo si Supabase comparte esta clave de firma;
// con una clave propia de la API el cliente debe usar el sondeo autenticado.

const key = () => new TextEncoder().encode(env().SESSION_JWT_SECRET);
const SESSION_TTL = "30d";

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(key());
}

export async function verifySession(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, key(), { audience: "authenticated", algorithms: ["HS256"] });
  if (!payload.sub) throw new Error("sin sub");
  return payload.sub;
}

export type AuthVars = { Variables: { userId: string } };

export const requireSession = createMiddleware<AuthVars>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    c.set("userId", await verifySession(token));
  } catch {
    throw new ApiError("UNAUTHORIZED", "Sesión inválida o caducada");
  }
  await next();
});
