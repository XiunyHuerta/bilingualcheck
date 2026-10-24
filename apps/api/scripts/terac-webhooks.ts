// Primero guardar el secreto en el receptor; después confirmar el ping firmado.
import { readFileSync, writeFileSync } from "node:fs";
import { terac } from "../src/terac/client";
import { prepareTeracWebhook } from "../src/terac/hook-setup";

process.env.TERAC_MODE = "live";
if (process.argv[2] === "--confirm") {
  const id = process.argv[3];
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Uso: pnpm terac:webhooks --confirm <id>");
  await terac.hooks.confirm(id);
  console.log(`✓ Ping firmado aceptado; suscripción ${id} confirmada.`);
} else {
  if (process.argv.length > 2) throw new Error("Uso: pnpm terac:webhooks [--confirm <id>]");
  const base = process.env.PUBLIC_API_URL;
  if (!base) throw new Error("Falta PUBLIC_API_URL");
  const prepared = await prepareTeracWebhook(base, terac.hooks);
  const file = new URL("../.env", import.meta.url);
  const previous = readFileSync(file, "utf8");
  const line = `TERAC_WEBHOOK_SECRET=${JSON.stringify(prepared.secret)}`;
  const next = /^TERAC_WEBHOOK_SECRET=.*$/m.test(previous)
    ? previous.replace(/^TERAC_WEBHOOK_SECRET=.*$/m, () => line) : `${previous}\n${line}\n`;
  writeFileSync(file, next);
  console.log(`✓ Suscripción ${prepared.reused ? "reutilizada" : "creada"}: ${prepared.id}`);
  console.log("Secreto guardado en apps/api/.env (ignorado). No se imprime.");
  console.log("Configura TERAC_WEBHOOK_SECRET en Vercel y vuelve a desplegar ANTES de confirmar.");
  console.log(`Después: pnpm terac:webhooks --confirm ${prepared.id}`);
}
