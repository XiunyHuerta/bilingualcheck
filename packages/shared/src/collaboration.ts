import { z } from "zod";

export const CollaborationRole = z.enum(["client", "professional"]);
export type CollaborationRole = z.infer<typeof CollaborationRole>;
export const MeetingStatus = z.enum(["proposed", "confirmed", "declined", "cancelled"]);
export type MeetingStatus = z.infer<typeof MeetingStatus>;

// Video providers only; never open arbitrary URLs supplied in a message.
export function isMeetingUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port &&
      ["meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com"].some(
        (host) => u.hostname === host || (host === "zoom.us" && u.hostname.endsWith(".zoom.us")),
      );
  } catch { return false; }
}
const meetingUrl = z.string().trim().max(2000).refine(isMeetingUrl);
export const CollaborationBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), message: z.string().trim().min(1).max(5000) }),
  z.object({ kind: z.literal("meeting"), message: z.string().trim().min(1).max(1000),
    starts_at: z.iso.datetime({ offset: true }), duration_minutes: z.number().int().min(15).max(120),
    meeting_url: meetingUrl.optional() }),
]);
export type CollaborationInput = z.infer<typeof CollaborationBody>;
export const MeetingActionBody = z.object({
  action: z.enum(["confirm", "decline", "cancel", "share_link"]),
  version: z.number().int().min(1), meeting_url: meetingUrl.optional(),
});
export type MeetingAction = z.infer<typeof MeetingActionBody>;

export function meetingTransition(status: MeetingStatus, author: CollaborationRole, actor: CollaborationRole,
  action: MeetingAction["action"]): MeetingStatus {
  if (action === "share_link" && actor === "professional" && ["proposed", "confirmed"].includes(status)) return status;
  if (action === "cancel" && ["proposed", "confirmed"].includes(status)) return "cancelled";
  if (status === "proposed" && actor !== author) {
    if (action === "confirm") return "confirmed";
    if (action === "decline") return "declined";
  }
  throw new Error("Invalid meeting action");
}

// Require explicit confirmation by the other person, with a reasonable booking horizon.
export function validMeetingTime(startsAt: string, now = Date.now()) {
  const time = Date.parse(startsAt);
  return Number.isFinite(time) && time > now && time <= now + 180 * 86_400_000;
}

/** Strict local input; reject dates that JS would silently roll into the next month. */
export function localMeetingTime(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const date = new Date(y!, m! - 1, d!, h!, min!);
  if (date.getFullYear() !== y || date.getMonth() !== m! - 1 || date.getDate() !== d ||
      date.getHours() !== h || date.getMinutes() !== min) return null;
  return date.toISOString();
}

export type CollaborationItem = {
  id: string; project_id: string; submission_id: string; kind: "message" | "meeting";
  author: CollaborationRole; message: string; starts_at: string | null; duration_minutes: number | null;
  meeting_url: string | null; status: MeetingStatus | null; version: number;
  updated_by: CollaborationRole; client_read_at: string | null; created_at: string; updated_at: string;
};
