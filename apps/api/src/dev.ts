// Servidor local: pnpm dev:api. En local no hay Vercel Cron, así que el
// sondeo de cotizaciones corre aquí cada 30 s.
import { serve } from "@hono/node-server";
import { app } from "./app";
import { pollQuotes } from "./routes/cron";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`BilingualCheck API → http://localhost:${port}/health`));

if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("<")) {
  setInterval(() => pollQuotes().catch((err) => console.error("[cron local]", err)), 30_000);
}
