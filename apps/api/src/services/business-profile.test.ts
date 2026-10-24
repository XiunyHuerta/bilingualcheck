import { describe, expect, it } from "vitest";
import { BusinessProfile, BusinessLink, ownsProfilePhotos, PatchMeBody } from "@bc/shared";
import { businessProfileHtml, profileImageType } from "./business-profile";

const owner = "11111111-1111-4111-8111-111111111111";
const photo = `profiles/${owner}/22222222-2222-4222-8222-222222222222.jpg`;

describe("perfil del negocio", () => {
  it("admite un perfil vacío y mantiene privado el contexto por defecto", () => {
    const profile = BusinessProfile.parse({});
    expect(profile.share_with_professionals).toBe(false);
    expect(businessProfileHtml("Negocio", profile)).toBe("");
    expect(PatchMeBody.safeParse({ business_name: null, business_profile: profile }).success).toBe(true);
  });

  it("limita descripción, galería y enlaces para evitar contenido ejecutable", () => {
    for (const website of ["javascript:alert(1)", "data:text/html,x", "file:///secret", "https://user:password@example.com"]) {
      expect(BusinessLink.safeParse(website).success).toBe(false);
    }
    expect(BusinessProfile.safeParse({ description: "x".repeat(601) }).success).toBe(false);
    expect(BusinessProfile.safeParse({ photo_paths: Array(4).fill(photo) }).success).toBe(false);
    expect(BusinessLink.safeParse("https://example.com/catalog").success).toBe(true);
  });

  it("no permite adjuntar imágenes de otro propietario ni rutas relativas", () => {
    expect(ownsProfilePhotos(BusinessProfile.parse({ logo_path: photo }), owner)).toBe(true);
    expect(ownsProfilePhotos(BusinessProfile.parse({ photo_paths: [photo] }), "other")).toBe(false);
    expect(BusinessProfile.safeParse({ logo_path: `profiles/${owner}/../secret.jpg` }).success).toBe(false);
  });

  it("comparte solo el contexto solicitado y escapa texto y enlaces en el portal", () => {
    const profile = BusinessProfile.parse({ description: '<script>alert("x")</script>', audience: "Familias",
      website: "https://example.com/?a=1&b=2", contact: "Business only", share_with_professionals: true });
    const output = businessProfileHtml("<Business>", profile);
    expect(output).toContain("&lt;Business&gt;");
    expect(output).toContain("&lt;script&gt;");
    expect(output).toContain("?a=1&amp;b=2");
    expect(output).toContain("Familias");
    expect(output).not.toContain("<script>");
    expect(businessProfileHtml("Business", { ...profile, share_with_professionals: false })).toBe("");
  });

  it("identifica imágenes por sus bytes y rechaza HTML aunque se llame foto", () => {
    expect(profileImageType(Buffer.from([255, 216, 255, 0]))).toBe("jpg");
    expect(profileImageType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("png");
    expect(profileImageType(Buffer.from("RIFF1234WEBP"))).toBe("webp");
    expect(profileImageType(Buffer.from("<html>photo.jpg</html>"))).toBeNull();
  });
});
