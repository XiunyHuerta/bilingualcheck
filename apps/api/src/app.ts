import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ConfigError } from "./env";
import { ApiError } from "./lib/errors";
import { configurationReport } from "./configuration";
import { authRoutes } from "./routes/auth";
import { cronRoutes } from "./routes/cron";
import { projectRoutes } from "./routes/projects";
import { collaborationRoutes } from "./routes/collaboration";
import { professionalRoutes } from "./routes/professional";
import { webhookRoutes } from "./routes/webhooks";
import { checkoutAppReturnUrl } from "./whop/redirects";
import { workspaceRoutes } from "./routes/workspace";
import { localizationRoutes } from "./routes/localization";

export const app = new Hono();

app.use("*", logger(message => console.log(message.replace(/\?[^\s]*/g, "?[redacted]"))));
app.use("/v1/*", cors());
// La versión web de la app consulta /health desde otro dominio (etiqueta "Concept demo").
app.use("/health", cors());

// Quien abre la URL en el navegador ve qué es esto en vez de un 404 (la interfaz es la app Expo).
app.get("/", (c) =>
  c.json({ service: "bilingualcheck-api", message: "API de BilingualCheck. La interfaz es la app Expo.", health: "/health" }),
);
app.get("/favicon.ico", (c) => c.body(null, 204));

app.get("/health", (c) =>
  c.json({ ok: true, service: "bilingualcheck-api", terac_mode: process.env.TERAC_MODE ?? "replay", configuration: configurationReport(), time: new Date().toISOString() }),
);

app.route("/v1", localizationRoutes);
app.route("/v1", authRoutes);
app.route("/v1", projectRoutes);
app.route("/v1", collaborationRoutes);
app.route("/v1", workspaceRoutes);
app.route("/", webhookRoutes);
app.route("/", professionalRoutes);
app.route("/", cronRoutes);

// Whop redirige aquí tras el checkout (necesita https); devolvemos al cliente a la app.
// La app solo muestra "Confirmando pago…": la verdad la decide el webhook.
app.get("/checkout/return", (c) => {
  c.header("Cache-Control", "no-store");
  return c.redirect(checkoutAppReturnUrl(new URL(c.req.url).searchParams));
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
