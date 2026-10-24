import { BusinessProfile, ownsProfilePhotos } from "@bc/shared";
import { env } from "../env";
import { signedDownloadUrl } from "../lib/storage";

export async function profileMedia(profile: BusinessProfile | null | undefined, userId: string) {
  if (!profile || !ownsProfilePhotos(profile, userId)) return {};
  const paths = [...new Set([profile.logo_path, ...profile.photo_paths].filter((p): p is string => Boolean(p)))];
  const urls = await Promise.all(paths.map(async (path) => [path,
    await signedDownloadUrl(env().STORAGE_BUCKET_UPLOADS, path, 3600)] as const));
  return Object.fromEntries(urls);
}

export function profileImageType(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP") return "webp";
  return null;
}

const html = (value: string) => value.replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Called only after the professional's Terac assignment has been verified. */
export function businessProfileHtml(name: string | null, input: unknown, media: Record<string, string> = {}) {
  const parsed = BusinessProfile.safeParse(input);
  if (!parsed.success || !parsed.data.share_with_professionals) return "";
  const p = parsed.data;
  const row = (label: string, value: string) => value ? `<p><b>${label}:</b> ${html(value)}</p>` : "";
  const image = (path: string, label: string) => media[path]
    ? `<img src="${html(media[path]!)}" alt="${label}" style="width:120px;height:120px;object-fit:cover;border-radius:14px;margin:4px">` : "";
  return `<section><h2>About the business</h2>${p.logo_path ? image(p.logo_path, "Business logo") : ""}
    ${name ? `<h3>${html(name)}</h3>` : ""}${row("Category", p.category)}${row("About", p.description)}
    ${row("Audience", p.audience)}${row("Location / service area", p.location)}
    ${row("Service", ({ local: "In person", remote: "Online", hybrid: "In person and online", "": "" })[p.service_mode])}
    ${p.website ? `<p><a href="${html(p.website)}" target="_blank" rel="noreferrer noopener">Website / catalog / social profile ↗</a></p>` : ""}
    ${row("Business contact", p.contact)}${row("Business hours", p.hours)}
    ${p.photo_paths.length ? `<div>${p.photo_paths.map((path) => image(path, "Business reference")).join("")}</div>` : ""}
    <p class="note">Business context supplied by the client. The confirmed project brief defines the scope of your work.</p></section>`;
}
