import { Hono } from "hono";
import { localizedUIChunk } from "../services/ui-localization";
import { ApiError } from "../lib/errors";

export const localizationRoutes = new Hono();
// Only public interface text is translated. Project, account and professional data never enter this endpoint.
const limits = new Map<string, { since: number; count: number }>();
let active = 0;
localizationRoutes.get("/localization/:language/:chunk", async c => {
  const address = c.req.header("x-vercel-forwarded-for") ?? c.req.header("x-forwarded-for") ?? "local";
  const now = Date.now();
  const rate = limits.get(address) ?? { since: now, count: 0 };
  if (now - rate.since > 10 * 60_000) { rate.since = now; rate.count = 0; }
  if (rate.count >= 60 || active >= 12) throw new ApiError("RATE_LIMITED", "Please retry language loading in a moment");
  rate.count++; limits.set(address, rate);
  if (limits.size > 1000) limits.delete(limits.keys().next().value!);
  active++;
  try {
    const result = await localizedUIChunk(c.req.param("language"), Number(c.req.param("chunk")));
    c.header("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return c.json(result);
  } finally { active--; }
});
