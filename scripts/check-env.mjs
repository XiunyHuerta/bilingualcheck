// Comprueba qué variables faltan en apps/api/.env y apps/mobile/.env
// según las plantillas .env.example. Uso: pnpm env:check
import { readFileSync, existsSync } from "node:fs";

const parse = (path) =>
  Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+#.*$/, "").trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );

const PLACEHOLDER = /^$|<|_$/;
let missing = 0;
for (const app of ["apps/api", "apps/mobile"]) {
  const example = parse(`${app}/.env.example`);
  if (!existsSync(`${app}/.env`)) {
    console.log(`✗ ${app}/.env no existe (copia ${app}/.env.example)`);
    missing++;
    continue;
  }
  const env = parse(`${app}/.env`);
  const empty = Object.keys(example).filter((k) => PLACEHOLDER.test(env[k] ?? ""));
  console.log(empty.length ? `• ${app}: faltan ${empty.join(", ")}` : `✓ ${app}: completo`);
  missing += empty.length;
}
process.exitCode = missing ? 1 : 0;
