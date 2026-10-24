import { z } from "zod";
import type { terac } from "./client";

const HookList = z.object({ data: z.array(z.object({ id: z.string(), target_url: z.string() }).loose()) }).loose();

/** Preparar NO confirma: el receptor debe recibir su secreto antes del ping firmado. */
export async function prepareTeracWebhook(base: string, hooks: typeof terac.hooks) {
  const url = new URL(base);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("PUBLIC_API_URL debe ser HTTPS pública para recibir webhooks");
  }
  const target = new URL("/webhooks/terac", url).href;
  const listed = HookList.parse(await hooks.list());
  const existing = listed.data.find((hook) => hook.target_url === target);
  const hook = existing ?? await hooks.create(target);
  const { secret } = z.object({ secret: z.string().min(1) }).parse(await hooks.secret(hook.id));
  return { id: hook.id, secret, reused: Boolean(existing) };
}
