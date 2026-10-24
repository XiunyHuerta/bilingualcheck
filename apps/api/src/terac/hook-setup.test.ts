import { describe, expect, it, vi } from "vitest";
import { prepareTeracWebhook } from "./hook-setup";

function hooks(existing = false) {
  return {
    list: vi.fn(async () => ({ data: existing ? [{ id: "old", target_url: "https://api.example.com/webhooks/terac" }] : [] })),
    create: vi.fn(async () => ({ id: "new" })), secret: vi.fn(async () => ({ secret: "test-secret" })), confirm: vi.fn(),
  };
}
describe("alta de webhooks de Terac", () => {
  it("obtiene el secreto antes de confirmar; nunca dispara un ping prematuro", async () => {
    const client = hooks();
    expect(await prepareTeracWebhook("https://api.example.com", client)).toEqual({ id: "new", secret: "test-secret", reused: false });
    expect(client.confirm).not.toHaveBeenCalled();
    expect(client.secret).toHaveBeenCalledWith("new");
  });
  it("reutiliza la suscripción de la misma URL sin duplicarla", async () => {
    const client = hooks(true);
    expect((await prepareTeracWebhook("https://api.example.com", client)).id).toBe("old");
    expect(client.create).not.toHaveBeenCalled();
  });
  it("rechaza localhost antes de cualquier llamada al proveedor", async () => {
    const client = hooks();
    await expect(prepareTeracWebhook("http://localhost:8787", client)).rejects.toThrow("HTTPS pública");
    expect(client.list).not.toHaveBeenCalled();
  });
});
