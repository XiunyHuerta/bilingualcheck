import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { GROUPS, ROOT, VARIABLES, evaluateApp, isPlaceholder, loadAppEnv } from "./check-env.mjs";
import { PROJECT, TEAM, checkRemote, parseOptions, verifyLink } from "./sync-vercel-env.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "bc-env-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "apps/api"), { recursive: true });
  return root;
}
const core = { SESSION_JWT_SECRET: "s".repeat(32), DATABASE_URL: "postgresql://u:p@localhost/db", SUPABASE_URL: "https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-role-key" };

test("native dotenv quotes, comments, multiline and export; local/process precedence", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "apps/api/.env"), 'export SESSION_JWT_SECRET="abc # inside=kept" # outside\nWHOP_CLIENT_SECRET=\'\'\nTERAC_API_KEY="line1\nline2"\nWHOP_CLIENT_ID=base\n');
  writeFileSync(join(root, "apps/api/.env.local"), 'WHOP_CLIENT_ID="local"\n');
  const values = loadAppEnv("api", { root, processEnv: { WHOP_CLIENT_ID: "process" } });
  assert.equal(values.SESSION_JWT_SECRET, "abc # inside=kept");
  assert.equal(values.WHOP_CLIENT_SECRET, "");
  assert.equal(values.TERAC_API_KEY, "line1\nline2");
  assert.equal(values.WHOP_CLIENT_ID, "process");
  assert.equal(loadAppEnv("api", { root, processEnv: {} }).WHOP_CLIENT_ID, "local");
  assert.equal(loadAppEnv("api", { root, processEnv: { WHOP_CLIENT_ID: "" } }).WHOP_CLIENT_ID, "");
});

test("missing files still accept process env and never load examples", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "apps/api/.env.example"), "WHOP_API_KEY=example-secret");
  const values = loadAppEnv("api", { root, processEnv: core });
  assert.equal(values.WHOP_API_KEY, undefined);
  assert.equal(evaluateApp("api", values).filter((row) => row.failed).length, 0);
});

test("empty quoted placeholders, biz_/prod_, templates and real IDs", () => {
  for (const value of ["biz_", "prod_", "<secret>", "https://<ref>.supabase.co", "changeme", "${SECRET}"]) assert.equal(isPlaceholder(value), true);
  for (const value of ["biz_ab123", "prod_xyz123", "real_secret_", "a # b"]) assert.equal(isPlaceholder(value), false);
  const rows = evaluateApp("api", { WHOP_ACCOUNT_ID: "biz_", WHOP_PRODUCT_ID: "prod_", WHOP_CLIENT_SECRET: "" }, GROUPS);
  assert.equal(rows.find((r) => r.name === "WHOP_ACCOUNT_ID").status, "placeholder");
  assert.equal(rows.find((r) => r.name === "WHOP_PRODUCT_ID").failed, true);
  assert.equal(rows.find((r) => r.name === "WHOP_CLIENT_SECRET").failed, false);
});

test("core required; optional AI/OAuth/payments are selectable independently", () => {
  assert.equal(evaluateApp("api", core).some((r) => r.failed), false);
  assert.deepEqual(evaluateApp("api", {}, ["ai"]).filter((r) => r.failed).map((r) => r.name), ["GEMINI_API_KEY"]);
  assert.deepEqual(evaluateApp("api", {}, ["whop-oauth"]).filter((r) => r.failed).map((r) => r.name), ["WHOP_CLIENT_ID"]);
  assert.equal(evaluateApp("api", { SESSION_JWT_SECRET: "short" }).find((r) => r.name === "SESSION_JWT_SECRET").failed, true);
  assert.equal(evaluateApp("mobile", {}, ["core"]).filter((r) => r.failed).length, 2);
});

test("Terac replay/default need no credentials; live requires key/project, never demo ID", () => {
  for (const values of [{}, { TERAC_MODE: "replay" }]) assert.equal(evaluateApp("api", values, ["terac"]).some((r) => r.failed), false);
  assert.deepEqual(evaluateApp("api", { TERAC_MODE: "live" }, ["terac"]).filter((r) => r.failed).map((r) => r.name), ["TERAC_API_KEY", "TERAC_PROJECT_ID"]);
  assert.equal(evaluateApp("api", { TERAC_MODE: "live", TERAC_API_KEY: "real-key", TERAC_PROJECT_ID: "real-project" }, ["terac"]).some((r) => r.failed), false);
  assert.equal(evaluateApp("api", { TERAC_MODE: "invalid" }, ["terac"]).find((r) => r.name === "TERAC_MODE").failed, true);
});

test("separate customer/provider caps and web URL remain in allowlist", () => {
  const rules = Object.fromEntries(VARIABLES.api.map((r) => [r.name, r]));
  assert.equal(rules.BUDGET_CAP_USD.default, "300");
  assert.equal(rules.TERAC_SPEND_CAP_USD.default, "100");
  assert.equal(rules.WEB_APP_URL.default, "https://bilingualcheck-app.vercel.app");
  assert.equal(evaluateApp("api", { ...core, BUDGET_CAP_USD: "300", TERAC_SPEND_CAP_USD: "100" }).some((r) => r.failed), false);
});

test("helper defaults offline and refuses writes, unknown project/team/target", () => {
  const base = ["--project", PROJECT.name, "--team", TEAM.slug];
  assert.deepEqual(parseOptions(base), { target: "preview", check: false });
  for (const args of [[], [...base, "--apply"], [...base, "--target", "bad"], [...base, "--team", "other"], [...base, "--project", "bilingualcheck-app"], [...base, "--check", "--dry-run"]]) assert.throws(() => parseOptions(args));
});

test("helper fails closed on missing, stale or mismatched local link", (t) => {
  const root = fixture(t);
  assert.throws(() => verifyLink(root));
  mkdirSync(join(root, ".vercel"));
  const path = join(root, ".vercel/project.json");
  writeFileSync(path, JSON.stringify({ projectId: PROJECT.id, orgId: TEAM.id, projectName: PROJECT.name }));
  verifyLink(root);
  writeFileSync(path, JSON.stringify({ projectId: "prj_wrong", orgId: TEAM.id }));
  assert.throws(() => verifyLink(root));
});

test("remote check requires login then exact project AND org; only read commands", () => {
  const calls = [];
  const project = { id: PROJECT.id, accountId: TEAM.id, name: PROJECT.name };
  checkRemote((args) => { calls.push(args); return JSON.stringify(project); });
  assert.deepEqual(calls.map((args) => args[0]), ["whoami", "project"]);
  assert.ok(calls.every((args) => args.includes(TEAM.slug) && args.includes("--non-interactive")));
  for (const bad of [{ ...project, id: "wrong" }, { ...project, accountId: "wrong" }, { ...project, name: "wrong" }]) assert.throws(() => checkRemote(() => JSON.stringify(bad)));
  assert.throws(() => checkRemote(() => { throw new Error("login required"); }));
});

test("checker output never includes supplied secret values", () => {
  const secret = "do-not-print-fixture-value-123456789";
  const result = spawnSync(process.execPath, [join(ROOT, "scripts/check-env.mjs"), "--group", "ai"], { env: { ...process.env, GEMINI_API_KEY: secret }, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("GEMINI_API_KEY: configured"));
  assert.ok(!(result.stdout + result.stderr).includes(secret));
});
