import { z } from "zod";

const shortText = (max: number) => z.string().trim().max(max).default("");
export const BusinessLink = z.union([
  z.literal(""),
  z.url().max(2048).refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }, "Use an http or https link"),
]);
export const ProfilePhotoPath = z.string().regex(/^profiles\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/);

/** Business context is shared only with the verified professional assigned to a project. */
export const BusinessProfile = z.object({
  category: shortText(80),
  description: shortText(600),
  audience: shortText(300),
  location: shortText(200),
  service_mode: z.enum(["", "local", "remote", "hybrid"]).default(""),
  website: BusinessLink.default(""),
  contact: shortText(200),
  hours: shortText(200),
  logo_path: ProfilePhotoPath.nullable().default(null),
  photo_paths: z.array(ProfilePhotoPath).max(3).default([]),
  share_with_professionals: z.boolean().default(false),
});
export type BusinessProfile = z.infer<typeof BusinessProfile>;

export function ownsProfilePhotos(profile: BusinessProfile, userId: string) {
  return [profile.logo_path, ...profile.photo_paths].every((path) => !path || path.startsWith(`profiles/${userId}/`));
}
