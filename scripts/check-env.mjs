// Standalone Node 24 checker. Never prints environment values.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const GROUPS = ["core", "ai", "terac", "whop-oauth", "whop-payments"];
function validUrl(value, protocols) {
  try { return protocols.includes(new URL(value).protocol); } catch { return false; }
}
const httpUrl = (v) => validUrl(v, ["http:", "https:"]);
const positive = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
const choice = (...values) => (v) => values.includes(v);
const variable = (name, group, options = {}) => ({ name, group, ...options });
// Defaults mirror the app; they are reported, never written to an env file.
export const VARIABLES = {
  api: [
    variable("SESSION_JWT_SECRET", "core", { required: true, validate: (v) => v.length >= 32 }),
    variable("DATABASE_URL", "core", { required: true, validate: (v) => validUrl(v, ["postgres:", "postgresql:"]) }),
    variable("SUPABASE_URL", "core", { required: true, validate: httpUrl }),
    variable("SUPABASE_SERVICE_ROLE_KEY", "core", { required: true }),
    variable("PUBLIC_API_URL", "core", { default: "http://localhost:8787", validate: httpUrl }),
    variable("WEB_APP_URL", "core", { default: "https://bilingualcheck-app.vercel.app", validate: httpUrl }),
    variable("APP_SCHEME", "core", { default: "bilingualcheck" }),
    variable("STORAGE_BUCKET_UPLOADS", "core", { default: "client-uploads" }),
    variable("STORAGE_BUCKET_DELIVERABLES", "core", { default: "deliverables" }),
    variable("FEE_RATE", "core", { default: "0.25", validate: (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1 }),
    variable("BUDGET_CAP_USD", "core", { default: "300", validate: positive }),
    variable("GEMINI_API_KEY", "ai", { required: true }),
    variable("AGENT_MODEL", "ai", { default: "gemini-3.6-flash" }),
    variable("REVIEW_MODEL", "ai", { default: "gemini-3.6-flash" }),
    variable("AGENT_MAX_TOOL_CALLS", "ai", { default: "8", validate: (v) => positive(v) && Number.isInteger(Number(v)) }),
    variable("TERAC_MODE", "terac", { default: "replay", validate: choice("live", "replay") }),
    variable("TERAC_BASE_URL", "terac", { default: "https://terac.com/api/external/v2", validate: httpUrl }),
    variable("TERAC_SPEND_CAP_USD", "terac", { default: "100", validate: positive }),
    variable("TERAC_API_KEY", "terac", { required: (env) => env.TERAC_MODE === "live" }),
    variable("TERAC_PROJECT_ID", "terac", { required: (env) => env.TERAC_MODE === "live" }),
    variable("TERAC_WEBHOOK_SECRET", "terac"),
    variable("TERAC_DEMO_FEASIBILITY_REQUEST_ID", "terac"),
    variable("CRON_SECRET", "terac"),
    variable("WHOP_ENV", "whop-oauth", { default: "sandbox", validate: choice("sandbox", "production") }),
    variable("WHOP_CLIENT_ID", "whop-oauth", { required: true }),
    variable("WHOP_CLIENT_SECRET", "whop-oauth"),
    variable("WHOP_API_KEY", "whop-payments", { required: true }),
    variable("WHOP_ACCOUNT_ID", "whop-payments", { required: true, validate: (v) => /^biz_[A-Za-z0-9]+$/.test(v) }),
    variable("WHOP_PRODUCT_ID", "whop-payments", { required: true, validate: (v) => /^prod_[A-Za-z0-9]+$/.test(v) }),
    variable("WHOP_WEBHOOK_SECRET", "whop-payments", { required: true }),
    variable("DEMO_PAYMENTS_ENABLED", "whop-payments", { default: "false", validate: choice("true", "false") }),
  ],
  mobile: [
    variable("EXPO_PUBLIC_API_URL", "core", { default: "http://localhost:8787", validate: httpUrl }),
    variable("EXPO_PUBLIC_SUPABASE_URL", "core", { required: true, validate: httpUrl }),
    variable("EXPO_PUBLIC_SUPABASE_ANON_KEY", "core", { required: true }),
    variable("EXPO_PUBLIC_WHOP_CLIENT_ID", "whop-oauth", { required: true }),
    variable("EXPO_PUBLIC_WHOP_ENV", "whop-oauth", { default: "sandbox", validate: choice("sandbox", "production") }),
  ],
};

export function isPlaceholder(value) {
  return /<[^>]*>|^(?:biz_|prod_|app_|sk-ant-|sk-)$|^(?:change[-_ ]?me|replace[-_ ]?me|your[-_ ].*|todo|example|placeholder|x{3,}|\.{3}|…)$|^\$\{[^}]+\}$/i.test(value.trim());
}

export function loadAppEnv(app, { root = ROOT, processEnv = process.env, file } = {}) {
  const values = {};
  const files = file ? [resolve(root, file)] : [resolve(root, `apps/${app}/.env`), resolve(root, `apps/${app}/.env.local`)];
  for (const path of files) {
    try { Object.assign(values, parseEnv(readFileSync(path, "utf8"))); }
    catch (error) {
      if (error.code !== "ENOENT" || file) throw new Error("No se pudo leer el archivo de entorno; valores ocultos.");
    }
  }
  for (const { name } of VARIABLES[app]) {
    if (processEnv[name] !== undefined) values[name] = processEnv[name];
  }
  return values;
}

export function variableStatus(rule, values) {
  const value = values[rule.name];
  if (value === undefined || value.trim() === "") return rule.default !== undefined ? "default" : "missing";
  if (isPlaceholder(value)) return "placeholder";
  return rule.validate && !rule.validate(value) ? "invalid" : "configured";
}

export function evaluateApp(app, values, selected = ["core", "terac"]) {
  return VARIABLES[app].map((rule) => {
    const required = typeof rule.required === "function" ? rule.required(values) : Boolean(rule.required);
    const status = variableStatus(rule, values);
    const checked = selected.includes(rule.group);
    const failed = checked && (required || rule.default !== undefined) && !["configured", "default"].includes(status);
    return { ...rule, required, status, checked, failed };
  });
}

export const HELP = `Uso: pnpm env:check [--group core,terac|ai|whop-oauth|whop-payments|all]
Grupos predeterminados: core y terac. Solo los grupos seleccionados afectan la salida.
Se informa también la preparación de las integraciones opcionales.
core: sesión + base de datos + storage (API y app).
ai: GEMINI_API_KEY; whop-oauth: client IDs; whop-payments: API, cuenta, producto, webhook.
terac: replay sin claves; live requiere API key + project ID. Webhook/cron opcionales.
WHOP_CLIENT_SECRET y TERAC_DEMO_FEASIBILITY_REQUEST_ID siempre opcionales.
Precedencia: process.env > apps/<app>/.env.local > apps/<app>/.env.
No se leen plantillas como valores reales ni se muestran valores/secretos.`;

export function main(args = process.argv.slice(2)) {
  let options;
  try { options = parseArgs({ args, options: { help: { type: "boolean", short: "h" }, group: { type: "string", multiple: true } } }).values; }
  catch { console.error("Argumentos inválidos. Usa --help."); return 2; }
  if (options.help) { console.log(HELP); return 0; }
  let selected = options.group?.flatMap((group) => group.split(",")) ?? ["core", "terac"];
  if (selected.some((group) => ![...GROUPS, "all"].includes(group))) { console.error("Grupo desconocido. Usa --help."); return 2; }
  if (selected.includes("all")) selected = GROUPS;
  let failures = 0;
  try {
    for (const app of ["api", "mobile"]) {
      const rows = evaluateApp(app, loadAppEnv(app), selected);
      console.log(`apps/${app}`);
      for (const group of GROUPS) {
        const members = rows.filter((row) => row.group === group);
        if (!members.length) continue;
        console.log(`  ${group} [${selected.includes(group) ? "comprobado" : "integración opcional"}]`);
        for (const row of members) {
          console.log(`    ${row.failed ? "FAIL" : "INFO"} ${row.name}: ${row.status} (${row.required ? "requerida para este grupo" : "opcional"})`);
          failures += Number(row.failed);
        }
      }
    }
  } catch { console.error("No se pudo comprobar el entorno; valores ocultos."); return 2; }
  console.log(`Requisitos pendientes en grupos seleccionados: ${failures}. Valores ocultos.`);
  return failures ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main();
