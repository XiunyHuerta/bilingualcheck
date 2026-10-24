import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("configuración independiente de Storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SESSION_JWT_SECRET", "test-session-key-with-at-least-32-characters");
    vi.stubEnv("DATABASE_URL", "postgresql://test:password@localhost:5432/test");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("WHOP_CLIENT_ID", "app_test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("permite usar la sesión y OAuth sin una clave de Storage", async () => {
    const { env } = await import("./env");
    expect(env().WHOP_CLIENT_ID).toBe("app_test");
    const { signSession, verifySession } = await import("./lib/session");
    const token = await signSession("test-user");
    await expect(verifySession(token)).resolves.toBe("test-user");
  });

  it("Storage devuelve un error explícito si falta su clave", async () => {
    const { ConfigError } = await import("./env");
    const { signedUploadUrl } = await import("./lib/storage");
    await expect(signedUploadUrl("client-uploads", "test.txt")).rejects.toBeInstanceOf(ConfigError);
    await expect(signedUploadUrl("client-uploads", "test.txt")).rejects.toMatchObject({ missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
  });

  it("el diagnóstico distingue login y almacenamiento", async () => {
    const { configurationReport } = await import("./configuration");
    expect(configurationReport().groups).toMatchObject({
      core: { configured: true },
      whop_login: { configured: true },
      storage: { configured: false, missing: ["SUPABASE_SERVICE_ROLE_KEY"] },
    });
  });
});
