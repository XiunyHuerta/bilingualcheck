import { CollaborationBody, MeetingActionBody } from "@bc/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import { type AuthVars, requireSession } from "../lib/session";
import { body } from "../lib/validate";
import { actOnMeeting, clientNotifications, createCollaboration, listCollaboration, projectProfessional, readNotification } from "../services/collaboration";
import { getOwnedProject } from "../services/projects";
import { demoProfessionalReply } from "../services/demo-work";

export const collaborationRoutes = new Hono<AuthVars>();
collaborationRoutes.use("*", requireSession);
collaborationRoutes.use("*", bodyLimit({ maxSize: 30_000 }));
const uuid = (value: string) => {
  if (!z.uuid().safeParse(value).success) throw new ApiError("VALIDATION_ERROR", "Identificador inválido");
  return value;
};
const base = "/projects/:id/professionals/:sid";

collaborationRoutes.post(`${base}/demo-response`, async (c) =>
  c.json(await demoProfessionalReply(uuid(c.req.param("id")), c.get("userId"), uuid(c.req.param("sid")))));

collaborationRoutes.get(`${base}/activity`, async (c) => {
  const project = await getOwnedProject(uuid(c.req.param("id")), c.get("userId"));
  const sid = uuid(c.req.param("sid"));
  const professional = await projectProfessional(project.id, sid);
  const before = c.req.query("before");
  if (before && !z.iso.datetime({ offset: true }).safeParse(before).success) throw new ApiError("VALIDATION_ERROR", "Fecha inválida");
  return c.json({ professional: { id: professional.id, status: professional.status,
    participant_summary: professional.participant_summary, client_decision: professional.client_decision },
    activity: await listCollaboration(project.id, sid, before ? new Date(before) : undefined) });
});

collaborationRoutes.post(`${base}/activity`, async (c) => {
  const project = await getOwnedProject(uuid(c.req.param("id")), c.get("userId"));
  const input = await body(c, CollaborationBody);
  return c.json({ item: await createCollaboration(project.id, uuid(c.req.param("sid")), "client", input) }, 201);
});

collaborationRoutes.post(`${base}/meetings/:mid`, async (c) => {
  const project = await getOwnedProject(uuid(c.req.param("id")), c.get("userId"));
  const input = await body(c, MeetingActionBody);
  return c.json({ item: await actOnMeeting(project.id, uuid(c.req.param("sid")), uuid(c.req.param("mid")), "client", input) });
});

collaborationRoutes.get("/notifications", async (c) => c.json(await clientNotifications(c.get("userId"))));
collaborationRoutes.post("/notifications/:nid/read", async (c) => {
  const input = await body(c, z.object({ version: z.number().int().min(1) }));
  await readNotification(c.get("userId"), uuid(c.req.param("nid")), input.version);
  return c.json({ ok: true });
});
