// Integration verification against a configured DB. Uses disposable test accounts only.
// No calls to live Terac, Whop or AI. Run with TERAC_MODE=replay.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { app } from "../src/app";
import { db, schema } from "../src/db/client";
import { miamiBrief } from "../src/demo/miami";
import { env } from "../src/env";
import { deliveryPortalUrl } from "../src/lib/delivery-token";
import { signSession } from "../src/lib/session";

assert.equal(env().TERAC_MODE, "replay", "This verification must use simulated Terac");
const permission = await db().execute(sql`select has_table_privilege(current_user, 'public.users', 'DELETE') as can_cleanup`);
assert.equal(permission[0]?.can_cleanup, true, "Use a disposable test database/role with DELETE permission for fixture cleanup; do not expand the production API role");
const ids = [crypto.randomUUID(), crypto.randomUUID()];
let checks = 0;
const check = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
try {
  await db().insert(schema.users).values(ids.map((id) => ({ id, whop_user_id: `collaboration_verification_${id}`, name: "Collaboration test account" })));
  const [project] = await db().insert(schema.projects).values({ user_id: ids[0]!, status: "in_progress",
    source_language: "es", target_language: "en", brief: miamiBrief, brief_confirmed: true }).returning();
  const externalOpportunity = `replay_collaboration_${project!.id}`;
  const [opportunity] = await db().insert(schema.teracOpportunities).values({ project_id: project!.id,
    terac_opportunity_id: externalOpportunity, status: "active" }).returning();
  const externalId = `replay_sub_${externalOpportunity}`;
  const [sub] = await db().insert(schema.submissions).values({ opportunity_id: opportunity!.id,
    terac_submission_id: externalId, status: "in_progress", participant_summary: { name: "Profesional de prueba · simulado", experience: ["Perfil para verificación"] } }).returning();
  const token = await signSession(ids[0]!);
  const stranger = await signSession(ids[1]!);
  const base = `/v1/projects/${project!.id}/professionals/${sub!.id}`;
  const request = (path: string, input?: unknown, session = token) => app.request(path, {
    method: input ? "POST" : "GET", headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  check((await app.request("/v1/notifications")).status, 401);
  check((await request(`${base}/activity`, undefined, stranger)).status, 404);
  const portal = new URL(await deliveryPortalUrl(project!.id));
  portal.searchParams.set("submissionId", externalId);
  const professionalPost = (path: string, form: Record<string, string>) => app.request(`${path}${portal.search}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form),
  });
  check((await app.request(`/professional/contact?submissionId=${externalId}`, { method: "POST" })).status, 401);
  check((await professionalPost("/professional/contact", { kind: "message", message: "Tengo una propuesta cultural para revisar contigo." })).status, 303);
  let notices = await (await request("/v1/notifications")).json();
  check(notices.unread_count, 1);
  check((await (await request("/v1/notifications", undefined, stranger)).json()).unread_count, 0);
  check((await request(`${base}/activity`, { kind: "message", message: "Gracias, podemos hablar mañana." })).status, 201);
  const firstNotice = notices.notifications[0];
  await request(`/v1/notifications/${firstNotice.id}/read`, { version: firstNotice.version }, stranger);
  check((await (await request("/v1/notifications")).json()).unread_count, 1);
  await request(`/v1/notifications/${firstNotice.id}/read`, { version: firstNotice.version });
  check((await (await request("/v1/notifications")).json()).unread_count, 0);
  const starts = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const create = await request(`${base}/activity`, { kind: "meeting", message: "Revisión de campaña", starts_at: starts, duration_minutes: 30 });
  check(create.status, 201);
  const meeting = (await create.json()).item;
  check((await request(`${base}/meetings/${meeting.id}`, { action: "confirm", version: 1 })).status, 409);
  check((await request(`${base}/meetings/${meeting.id}`, { action: "confirm", version: 1 }, stranger)).status, 404);
  check((await professionalPost("/professional/meeting", { item_id: meeting.id, version: "1", action: "confirm", meeting_url: "https://meet.google.com/test-call" })).status, 303);
  notices = await (await request("/v1/notifications")).json();
  check(notices.unread_count, 1);
  check(notices.notifications[0].status, "confirmed");
  check(notices.notifications[0].meeting_url, "https://meet.google.com/test-call");
  // A read receipt from an older view cannot hide a newer confirmation.
  await request(`/v1/notifications/${meeting.id}/read`, { version: 1 });
  check((await (await request("/v1/notifications")).json()).unread_count, 1);
  check((await request(`${base}/meetings/${meeting.id}`, { action: "cancel", version: 1 })).status, 409);
  const overlap = await (await request(`${base}/activity`, { kind: "meeting", message: "Otra reunión", starts_at: starts, duration_minutes: 30 })).json();
  check((await professionalPost("/professional/meeting", { item_id: overlap.item.id, version: "1", action: "confirm" })).status, 409);
  check((await professionalPost("/professional/meeting", { item_id: meeting.id, version: "2", action: "share_link", meeting_url: "javascript:alert(1)" })).status, 400);
  check((await professionalPost("/professional/contact", { kind: "meeting", message: "Otra propuesta del profesional", starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16), duration_minutes: "30" })).status, 303);
  const rows = await (await request(`${base}/activity`)).json();
  const proMeeting = rows.activity.find((v: { kind: string; author: string }) => v.kind === "meeting" && v.author === "professional");
  check((await request(`${base}/meetings/${proMeeting.id}`, { action: "confirm", version: proMeeting.version })).status, 200);
  check((await request(`${base}/meetings/${meeting.id}`, { action: "cancel", version: 2 })).status, 200);
  if (process.env.COLLABORATION_BROWSER_FIXTURE === "1") {
    // Browser fixtures are deliberately isolated and must be cleaned with --cleanup afterwards.
    const dir = resolve("../../.codex-local"); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "collaboration-fixture.json"), JSON.stringify({ users: ids, token, projectId: project!.id, submissionId: sub!.id, portal: `${portal.pathname}${portal.search}` }));
    console.log(`Verified ${checks} checks. Disposable browser fixture saved locally.`);
  } else {
    await db().delete(schema.users).where(inArray(schema.users.id, ids));
    console.log(`Verified ${checks} checks; disposable data removed.`);
  }
} catch (error) {
  await db().delete(schema.users).where(inArray(schema.users.id, ids));
  throw error;
}
process.exit(0);
