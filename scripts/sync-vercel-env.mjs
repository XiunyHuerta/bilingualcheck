// Read-only checkpoint helper. No env writes, pulls, or authentication flows.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ROOT, VARIABLES, loadAppEnv, variableStatus } from "./check-env.mjs";

export const TEAM = { slug: "xiu17", id: "team_RmJIa4usw0mO3J6dFWi0L5zg" };
export const PROJECT = { name: "bilingualcheck-api", id: "prj_6qZCWJp1aMUS5T8gz0kOCCTS9z3z" };
export const HELP = `Uso: node scripts/sync-vercel-env.mjs --project bilingualcheck-api --team xiu17
  [--target preview|production|development] [--dry-run | --check]
--dry-run predeterminado: offline; solo nombres, destinos y estados, nunca valores.
--check: comprueba login CLI y proyecto/equipo remoto; nunca hace login ni link.
Requiere el enlace .vercel/project.json con los IDs conocidos del repositorio.
Precedencia: process.env > apps/api/.env.local > apps/api/.env.
Incluye WEB_APP_URL, TERAC_SPEND_CAP_USD y BUDGET_CAP_USD por separado.
--apply NO está implementado: este helper es solo de planificación y comprobación.
No hace pulls, cambios remotos, despliegues ni admite secretos como argumentos.
Para gestionar una variable tras verificar el destino, usa Vercel CLI con el valor
por stdin: vercel env add NOMBRE --environment preview --project ${PROJECT.id} --scope xiu17
No uses --value ni echo con secretos. Ejecuta vercel login por separado si hace falta.
La web no está habilitada: falta su ID/enlace local verificado.`;

export function parseOptions(args) {
  let values;
  try {
    ({ values } = parseArgs({ args, options: {
      help: { type: "boolean", short: "h" }, project: { type: "string" }, team: { type: "string" },
      target: { type: "string" }, "dry-run": { type: "boolean" }, check: { type: "boolean" }, apply: { type: "boolean" },
    } }));
  } catch { throw new Error("Argumentos inválidos. Usa --help."); }
  if (values.help) return { help: true };
  if (values.apply) throw new Error("--apply no está implementado; no se ha escrito ninguna variable.");
  if (values.check && values["dry-run"]) throw new Error("Selecciona --dry-run o --check.");
  if (![PROJECT.name, PROJECT.id].includes(values.project) || values.team !== TEAM.slug) throw new Error("Se requieren --project conocido y --team xiu17 exactos.");
  const target = values.target ?? "preview";
  if (!["preview", "production", "development"].includes(target)) throw new Error("Target inválido.");
  return { target, check: Boolean(values.check) };
}

export function verifyLink(root = ROOT) {
  const paths = [join(root, ".vercel/project.json"), join(root, "apps/api/.vercel/project.json")];
  let matched = false;
  for (const path of paths) {
    if (!existsSync(path)) continue;
    let link;
    try { link = JSON.parse(readFileSync(path, "utf8")); }
    catch { throw new Error("Enlace .vercel inválido; no se modifica."); }
    if (link.orgId !== TEAM.id || link.projectId !== PROJECT.id || (link.projectName && link.projectName !== PROJECT.name)) {
      throw new Error("El enlace .vercel no coincide con el proyecto/equipo autorizado.");
    }
    matched = true;
  }
  if (!matched) throw new Error("Falta un enlace .vercel verificado; no se realiza link automático.");
}

// Run npm's Windows JS entry directly: no .cmd shell, no value in argv.
export function findCli(env = process.env) {
  const directories = [join(ROOT, "node_modules/.bin"), ...(env.PATH ?? env.Path ?? "").split(delimiter)];
  for (const directory of directories.filter(Boolean)) {
    for (const candidate of [join(directory, "node_modules/vercel/dist/vc.js"), join(directory, "../vercel/dist/vc.js")]) {
      if (existsSync(candidate)) return { command: process.execPath, prefix: [resolve(candidate)] };
    }
    const executable = join(directory, process.platform === "win32" ? "vercel.exe" : "vercel");
    if (existsSync(executable)) {
      const path = realpathSync(executable);
      return path.endsWith(".js") ? { command: process.execPath, prefix: [path] } : { command: path, prefix: [] };
    }
  }
  throw new Error("Vercel CLI no disponible. Instálalo y ejecuta vercel login por separado.");
}

export function checkRemote(run) {
  const common = ["--scope", TEAM.slug, "--non-interactive"];
  run(["whoami", ...common]);
  const output = run(["project", "inspect", PROJECT.id, "--json", ...common]);
  let project;
  try { project = JSON.parse(output); }
  catch { throw new Error("Respuesta de proyecto no verificable; salida oculta."); }
  if (project.id !== PROJECT.id || project.accountId !== TEAM.id || project.name !== PROJECT.name) {
    throw new Error("El proyecto/equipo remoto no coincide.");
  }
}

export function main(args = process.argv.slice(2)) {
  try {
    const options = parseOptions(args);
    if (options.help) { console.log(HELP); return 0; }
    verifyLink();
    const values = loadAppEnv("api");
    console.log(`Proyecto: ${PROJECT.name}; equipo: ${TEAM.slug}; modo: ${options.check ? "check" : "dry-run"}`);
    for (const rule of VARIABLES.api) console.log(`${rule.name} -> ${options.target} [${variableStatus(rule, values)}]`);
    if (options.check) {
      const cli = findCli();
      const env = { ...process.env, CI: "1", NO_COLOR: "1", VERCEL_TELEMETRY_DISABLED: "1", VERCEL_PROJECT_ID: PROJECT.id, VERCEL_ORG_ID: TEAM.id };
      for (const rule of Object.values(VARIABLES).flat()) delete env[rule.name];
      delete env.DEBUG;
      delete env.VERCEL_DEBUG;
      checkRemote((args) => {
        const result = spawnSync(cli.command, [...cli.prefix, ...args], { cwd: ROOT, env, shell: false, windowsHide: true, input: "", encoding: "utf8", timeout: 15_000, maxBuffer: 1_000_000 });
        if (result.error || result.status !== 0) throw new Error("Vercel CLI falló o agotó el tiempo. Comprueba login/permisos por separado; salida oculta.");
        return result.stdout;
      });
      console.log("Login y proyecto/equipo verificados; sin escrituras.");
    }
    return 0;
  } catch (error) {
    // All thrown messages above are fixed text, with no values or raw CLI output.
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main();
