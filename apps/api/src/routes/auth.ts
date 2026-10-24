import { AuthWhopBody, PatchMeBody } from "@bc/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/client";
import { ApiError } from "../lib/errors";
import { type AuthVars, requireSession, signSession } from "../lib/session";
import { body } from "../lib/validate";
import { exchangeOAuthCode } from "../whop/client";
import { nativeOAuthReturnUrl } from "../whop/redirects";

export const authRoutes = new Hono<AuthVars>();

// Whop solo recibe un callback HTTPS. El destino nativo es fijo y no lleva tokens.
authRoutes.get("/auth/whop/callback/native", (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(nativeOAuthReturnUrl(new URL(c.req.url).searchParams));
});

const OAuthBody = AuthWhopBody.extend({
  code: z.string().min(1).max(4096),
  code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  redirect_uri: z.string().min(1).max(2048),
});

// Sign in with Whop: la app hace PKCE y nos manda el código; el intercambio
// se hace aquí para emitir nuestra propia sesión (doc 05).
authRoutes.post("/auth/whop", async (c) => {
  const input = await body(c, OAuthBody);
  const { profile } = await exchangeOAuthCode(input);
  const [user] = await db()
    .insert(schema.users)
    .values({
      whop_user_id: profile.sub,
      email: profile.email ?? null,
      name: profile.name ?? profile.preferred_username ?? null,
    })
    .onConflictDoUpdate({
      target: schema.users.whop_user_id,
      set: { email: profile.email ?? null, name: profile.name ?? profile.preferred_username ?? null },
    })
    .returning();
  return c.json({ session_jwt: await signSession(user!.id), user });
});

// La sesión es un JWT propio sin estado y no guardamos tokens de Whop:
// cerrar sesión consiste en borrarlo del dispositivo.
authRoutes.post("/auth/logout", requireSession, (c) => c.json({ ok: true }));

authRoutes.get("/me", requireSession, async (c) => {
  const user = await db().query.users.findFirst({ where: eq(schema.users.id, c.get("userId")) });
  if (!user) throw new ApiError("UNAUTHORIZED", "Usuario no encontrado");
  return c.json({ user });
});

authRoutes.patch("/me", requireSession, async (c) => {
  const patch = await body(c, PatchMeBody);
  const [user] = await db().update(schema.users).set(patch).where(eq(schema.users.id, c.get("userId"))).returning();
  return c.json({ user });
});
