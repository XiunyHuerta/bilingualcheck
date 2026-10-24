import { AuthWhopBody, PatchMeBody, ownsProfilePhotos } from "@bc/shared";
import { randomUUID } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/client";
import { ApiError } from "../lib/errors";
import { type AuthVars, requireSession, signSession } from "../lib/session";
import { body } from "../lib/validate";
import { exchangeOAuthCode } from "../whop/client";
import { nativeOAuthReturnUrl } from "../whop/redirects";
import { profileImageType, profileMedia } from "../services/business-profile";
import { storeProfileImage, signedDownloadUrl } from "../lib/storage";
import { env } from "../env";

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
  c.header("Cache-Control", "no-store");
  return c.json({ user: { ...user, uploads_enabled: Boolean(env().SUPABASE_SERVICE_ROLE_KEY), profile_media: await profileMedia(user.business_profile, user.id) } });
});

authRoutes.patch("/me", requireSession, async (c) => {
  const patch = await body(c, PatchMeBody);
  if (patch.business_profile && !ownsProfilePhotos(patch.business_profile, c.get("userId"))) {
    throw new ApiError("VALIDATION_ERROR", "Las imágenes deben pertenecer a tu negocio");
  }
  if (!Object.keys(patch).length) throw new ApiError("VALIDATION_ERROR", "No hay cambios para guardar");
  const [user] = await db().update(schema.users).set(patch).where(eq(schema.users.id, c.get("userId"))).returning();
  if (!user) throw new ApiError("UNAUTHORIZED", "Usuario no encontrado");
  c.header("Cache-Control", "no-store");
  return c.json({ user: { ...user, uploads_enabled: Boolean(env().SUPABASE_SERVICE_ROLE_KEY), profile_media: await profileMedia(user.business_profile, user.id) } });
});

authRoutes.post("/me/photos", requireSession, bodyLimit({ maxSize: 3 * 1024 * 1024 }), async (c) => {
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const extension = profileImageType(bytes);
  if (!extension) throw new ApiError("VALIDATION_ERROR", "Usa una imagen JPG, PNG o WebP de hasta 3 MB");
  const path = `profiles/${c.get("userId")}/${randomUUID()}.${extension}`;
  await storeProfileImage(path, bytes, extension === "jpg" ? "image/jpeg" : `image/${extension}`);
  return c.json({ path, url: await signedDownloadUrl(env().STORAGE_BUCKET_UPLOADS, path, 3600) }, 201);
});
