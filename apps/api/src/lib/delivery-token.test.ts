import { describe, expect, it, vi } from "vitest";
vi.mock("../env", () => ({ env: () => ({ SESSION_JWT_SECRET: "a-valid-test-key-with-at-least-32-chars", PUBLIC_API_URL: "https://api.example.com" }) }));
import { deliveryPortalUrl, verifyDeliveryToken } from "./delivery-token";
import { verifySession } from "./session";
import { DeliveryText, escapeHtml, professionalRoutes } from "../routes/professional";
import { ApiError } from "./errors";

describe("portal privado de entregas", () => {
  it("el token está ligado al proyecto y no puede usarse como sesión del cliente", async () => {
    const url = new URL(await deliveryPortalUrl("project-one"));
    const token = url.searchParams.get("token")!;
    expect(url.pathname).toBe("/professional/delivery");
    await expect(verifyDeliveryToken(token)).resolves.toBe("project-one");
    await expect(verifySession(token)).rejects.toThrow();
    await expect(verifyDeliveryToken(token.slice(0, -10) + "tampered")).rejects.toThrow();
  });
  it("rechaza un enlace sin token antes de leer datos del proyecto", async () => {
    professionalRoutes.onError((err, c) => c.json({ error: err.message }, err instanceof ApiError ? err.status : 500));
    const response = await professionalRoutes.request("/professional/delivery?submissionId=test");
    expect(response.status).toBe(401);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("escapa HTML del profesional y limita entregas vacías o gigantes", () => {
    expect(escapeHtml('<script src="x">&')).toBe("&lt;script src=&quot;x&quot;&gt;&amp;");
    expect(DeliveryText.safeParse(" ").success).toBe(false);
    expect(DeliveryText.safeParse("a".repeat(50_001)).success).toBe(false);
    expect(DeliveryText.parse("  Textos adaptados y notas culturales.  ")).toBe("Textos adaptados y notas culturales.");
  });
});
