// Alta de webhooks de Terac para este entorno (doc 04):
// 1) crear la suscripción, 2) confirmarla tras el webhook.ping, 3) leer el secreto.
// Uso: pnpm terac:webhooks          → crea y confirma
//      pnpm terac:webhooks <id>     → solo confirma y muestra el secreto
import { terac } from "../src/terac/client";

process.env.TERAC_MODE = "live";
const base = process.env.PUBLIC_API_URL;
if (!base || base.includes("localhost")) {
  throw new Error("PUBLIC_API_URL debe ser una URL pública (Vercel o túnel) para recibir webhooks");
}

let id = process.argv[2];
if (!id) {
  const sub = await terac.hooks.create(`${base}/webhooks/terac`);
  id = sub.id;
  console.log(`✓ Suscripción creada: ${id}. Esperando el webhook.ping…`);
  await new Promise((r) => setTimeout(r, 5_000));
}
await terac.hooks.confirm(id);
console.log("✓ Suscripción confirmada");
console.log("Secreto (guárdalo como TERAC_WEBHOOK_SECRET):");
console.log(JSON.stringify(await terac.hooks.secret(id), null, 2));
