import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ConfigError, env } from "./env";
import { ApiError } from "./lib/errors";
import { authRoutes } from "./routes/auth";
import { cronRoutes } from "./routes/cron";
import { projectRoutes } from "./routes/projects";
import { webhookRoutes } from "./routes/webhooks";

export const app = new Hono();

app.use("*", logger());
app.use("/v1/*", cors());

// Quien abre la URL en el navegador ve qué es esto en vez de un 404 (la interfaz es la app Expo).
app.get("/", (c) =>
  c.json({ service: "bilingualcheck-api", message: "API de BilingualCheck. La interfaz es la app Expo.", health: "/health" }),
);
app.get("/favicon.ico", (c) => c.body(null, 204));

app.get("/health", (c) =>
  c.json({ ok: true, service: "bilingualcheck-api", terac_mode: process.env.TERAC_MODE ?? "replay", time: new Date().toISOString() }),
);

app.route("/v1", authRoutes);
app.route("/v1", projectRoutes);
app.route("/", webhookRoutes);
app.route("/", cronRoutes);

// Whop redirige aquí tras el checkout (necesita https); devolvemos al cliente a la app.
// La app solo muestra "Confirmando pago…": la verdad la decide el webhook.
app.get("/checkout/return", (c) => {
  const params = new URLSearchParams(c.req.query());
  return c.redirect(`${env().APP_SCHEME}://checkout/return?${params}`);
});

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Ruta no encontrada" } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(err.toJSON(), err.status);
  if (err instanceof ConfigError) {
    return c.json({ error: { code: "NOT_CONFIGURED", message: err.message, details: { missing: err.missing } } }, 503);
  }
  console.error(err);
  return c.json({ error: { code: "INTERNAL", message: "Error interno" } }, 500);
});
