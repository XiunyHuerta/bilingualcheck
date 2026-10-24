import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SECONDS = 300;

/**
 * Verifica X-Terac-Request-Signature = base64(HMAC-SHA256(secret, timestamp + rawBody)).
 * Rechaza timestamps con más de 300 s de diferencia (doc 04).
 */
export function verifyTeracSignature(opts: {
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  secret: string;
  nowSeconds?: number;
}): { ok: true } | { ok: false; reason: "missing" | "stale" | "bad_signature" } {
  const { timestamp, signature, rawBody, secret } = opts;
  if (!timestamp || !signature) return { ok: false, reason: "missing" };
  const now = opts.nowSeconds ?? Date.now() / 1000;
  if (!Number.isFinite(Number(timestamp)) || Math.abs(now - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
