import type { CollaborationItem } from "@bc/shared";

const e = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function professionalContactHtml(url: string, items: CollaborationItem[], editable: boolean) {
  const target = (path: string) => { const u = new URL(url); u.pathname = path; u.searchParams.delete("before"); return e(u.href); };
  const post = target("/professional/contact");
  const action = target("/professional/meeting");
  const history = items.map((item) => {
    const meeting = item.kind === "meeting";
    const open = meeting && ["proposed", "confirmed"].includes(item.status ?? "");
    const future = item.starts_at && Date.parse(item.starts_at) > Date.now();
    return `<section><b>${item.author === "professional" ? "You" : "Client"} · ${meeting ? "Meeting" : "Message"}</b>
      <pre>${e(item.message)}</pre>${meeting ? `<p>${e(new Date(item.starts_at!).toISOString().slice(0, 16).replace("T", " "))} UTC · ${item.duration_minutes} min · <b>${e(item.status!)}</b></p>
      ${item.meeting_url ? `<p><a rel="noreferrer" href="${e(item.meeting_url)}">Open video call</a></p>` : "<p>Video link not shared yet.</p>"}
      ${editable && open ? `<form method="post" action="${action}"><input type="hidden" name="item_id" value="${e(item.id)}"><input type="hidden" name="version" value="${item.version}">
      ${future ? `<label>Video link (Google Meet, Zoom or Microsoft Teams)<input type="url" name="meeting_url" maxlength="2000" value="${e(item.meeting_url ?? "")}"></label>
      ${item.author === "client" && item.status === "proposed" ? '<button name="action" value="confirm">Confirm meeting</button> <button name="action" value="decline">Decline</button>' : ""}
      <button name="action" value="share_link">Share video link</button>` : ""}
      <button name="action" value="cancel">Cancel meeting</button></form>` : ""}` : ""}</section>`;
  }).join("");
  const older = items.length === 100 ? (() => { const u = new URL(url); u.pathname = "/professional/delivery";
    u.searchParams.set("before", items[items.length - 1]!.updated_at); return `<a href="${e(u.href)}#contact">Older activity</a>`; })() : "";
  return `<div id="contact"><h2>Client communication</h2><p>Messages and meeting updates appear in the client's BilingualCheck notifications. Reopen this portal to read replies. Meetings require the other person's confirmation.</p>
    ${editable ? `<section><h3>Share an update</h3><form method="post" action="${post}"><input type="hidden" name="kind" value="message"><label for="update">Message for the client</label><textarea id="update" name="message" required maxlength="5000" style="min-height:100px"></textarea><button>Send update</button></form></section>
    <section><h3>Propose a call</h3><form method="post" action="${post}"><input type="hidden" name="kind" value="meeting">
    <label>Purpose<textarea name="message" required maxlength="1000" style="min-height:80px"></textarea></label>
    <label>Date and time in UTC<input type="datetime-local" name="starts_at" required></label>
    <label>Duration<select name="duration_minutes"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="60">60 min</option></select></label>
    <label>Video link (optional)<input type="url" name="meeting_url" maxlength="2000" placeholder="https://meet.google.com/…"></label><button>Propose meeting</button></form></section>` : ""}
    <h3>Activity</h3>${history || "<p>No messages or meetings yet.</p>"}${older}</div>`;
}
