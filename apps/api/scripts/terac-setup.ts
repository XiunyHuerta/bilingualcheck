// Configura Terac para este entorno (doc 04): comprueba la API key, busca o crea el
// proyecto "BilingualCheck" y guarda su id en apps/api/.env como TERAC_PROJECT_ID.
// Uso: pnpm terac:setup            → comprueba y, si falta, crea el proyecto
//      pnpm terac:setup --check    → solo comprueba (no crea ni escribe nada)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ConfigError } from "../src/env";
import { terac } from "../src/terac/client";

const configuredMode = process.env.TERAC_MODE ?? "replay"; // el del .env; el script siempre habla con Terac
process.env.TERAC_MODE = "live";
const checkOnly = process.argv.includes("--check");
const PROJECT_NAME = "BilingualCheck";
const ENV_FILE = new URL("../.env", import.meta.url);

/** Pone `KEY=value` en el .env respetando el resto del archivo y sus saltos de línea. */
function upsertEnv(key: string, value: string) {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(ENV_FILE, pattern.test(text) ? text.replace(pattern, line) : `${text}${text && !text.endsWith("\n") ? eol : ""}${line}${eol}`);
}

try {
  const org = await terac.organizationContext();
  console.log(`✓ API key válida · organización: ${org.organizationName} · saldo: US$ ${org.balanceDollars.toFixed(2)}`);
  console.log(`  Claves API: ${org.dashboard.api_keys}`);
  if (org.balanceDollars <= 0) console.log(`  ⚠ Sin saldo: añade crédito en ${org.dashboard.finance} antes de lanzar oportunidades reales.`);

  const configured = process.env.TERAC_PROJECT_ID;
  if (configured) {
    const project = await terac.getProject(configured);
    console.log(`✓ TERAC_PROJECT_ID apunta a «${project.name}» (${project.id})`);
  } else {
    const existing = await terac.findProjectByName(PROJECT_NAME);
    if (existing) {
      console.log(`✓ Ya existe el proyecto «${PROJECT_NAME}» (${existing.id})`);
      if (!checkOnly) upsertEnv("TERAC_PROJECT_ID", existing.id);
    } else if (checkOnly) {
      console.log(`• Falta el proyecto «${PROJECT_NAME}»; pnpm terac:setup lo crea.`);
    } else {
      const created = await terac.createProject(PROJECT_NAME);
      console.log(`✓ Proyecto creado: «${created.name}» (${created.id}) · ${created.dashboard_url}`);
      upsertEnv("TERAC_PROJECT_ID", created.id);
    }
    if (!checkOnly) console.log("  Guardado en apps/api/.env como TERAC_PROJECT_ID.");
  }

  console.log("\nSiguiente:");
  const todo = [
    process.env.TERAC_WEBHOOK_SECRET ? null : "TERAC_WEBHOOK_SECRET → pnpm terac:webhooks (necesita PUBLIC_API_URL pública)",
    process.env.TERAC_DEMO_FEASIBILITY_REQUEST_ID ? null : "TERAC_DEMO_FEASIBILITY_REQUEST_ID → pedir una cotización real y reutilizarla en la demo",
    configuredMode === "live" ? null : "TERAC_MODE=live en apps/api/.env cuando quieras salir de replay (las oportunidades reales cuestan dinero)",
  ].filter(Boolean);
  for (const item of todo) console.log(`  • ${item}`);
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(`✗ Falta ${e.missing.join(", ")} en apps/api/.env.`);
    console.error("  Crea una API key en el panel de Terac (organización → API keys), ponla en TERAC_API_KEY");
    console.error("  y vuelve a ejecutar. No la pegues en chats ni la subas a git: .env está en .gitignore.");
    process.exitCode = 1;
  } else {
    throw e;
  }
}
