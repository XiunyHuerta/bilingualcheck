import { WhopClient, WhopEnvironment } from "@whop/sdk";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { z } from "zod";
import { env, required } from "../env";
import { ApiError } from "../lib/errors";

// Whop para identidad (Sign in with Whop) y cobro (checkout alojado + webhook).
// Las URLs de OAuth del sandbox siguen el mismo patrón que la API del SDK
// (sandbox-api.whop.com) [verificar en el panel de Whop si cambian].

const oauthBase = () => (env().WHOP_ENV === "sandbox" ? "https://sandbox-api.whop.com" : "https://api.whop.com");

let sdk: WhopClient | undefined;
function whop() {
  sdk ??= new WhopClient({
    token: required("WHOP_API_KEY"),
    environment: env().WHOP_ENV === "sandbox" ? WhopEnvironment.Sandbox : WhopEnvironment.Production,
  });
  return sdk;
}

const TokenResponse = z.object({ access_token: z.string(), refresh_token: z.string().optional() }).loose();
const UserInfo = z
  .object({
    sub: z.string(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    preferred_username: z.string().nullable().optional(),
  })
  .loose();
export type WhopUserInfo = z.infer<typeof UserInfo>;

/** Intercambia el código de OAuth (PKCE) y devuelve el perfil del usuario de Whop. */
export async function exchangeOAuthCode(input: { code: string; code_verifier: string; redirect_uri: string }) {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.code_verifier,
    redirect_uri: input.redirect_uri,
    client_id: required("WHOP_CLIENT_ID"),
  });
  const secret = env().WHOP_CLIENT_SECRET;
  if (secret) form.set("client_secret", secret);

  const tokenRes = await fetch(`${oauthBase()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form,
  });
  if (!tokenRes.ok) {
    throw new ApiError("UPSTREAM_WHOP", "Whop rechazó el código de autorización", {
      status: tokenRes.status,
      body: await tokenRes.text(),
    });
  }
  const tokens = TokenResponse.parse(await tokenRes.json());

  const infoRes = await fetch(`${oauthBase()}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) throw new ApiError("UPSTREAM_WHOP", "No se pudo leer el perfil de Whop", { status: infoRes.status });
  return { profile: UserInfo.parse(await infoRes.json()), refreshToken: tokens.refresh_token };
}

export async function revokeToken(token: string) {
  await fetch(`${oauthBase()}/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, client_id: required("WHOP_CLIENT_ID") }),
  });
}

/**
 * Checkout por proyecto: variante de pago único con el precio exacto de la cotización.
 * La metadata se copia al pago y vuelve en el webhook payment.succeeded.
 */
export async function createProjectCheckout(input: {
  projectId: string;
  quoteId: string;
  totalUsd: number;
  title: string;
}) {
  try {
    const checkout = await whop().checkoutConfigurations.create({
      account_id: required("WHOP_ACCOUNT_ID"),
      metadata: { project_id: input.projectId, quote_id: input.quoteId },
      redirect_url: `${env().PUBLIC_API_URL}/checkout/return?project_id=${input.projectId}`,
      plan: {
        product_id: required("WHOP_PRODUCT_ID"),
        plan_type: "one_time",
        currency: "usd",
        initial_price: input.totalUsd,
        title: input.title.slice(0, 80),
        visibility: "hidden",
        force_create_new_plan: true,
        metadata: { project_id: input.projectId },
      },
    });
    if (!checkout.purchase_url) throw new Error("Whop no devolvió purchase_url");
    return { checkoutId: checkout.id, variantId: checkout.plan?.id ?? null, purchaseUrl: checkout.purchase_url };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("UPSTREAM_WHOP", "No se pudo crear el checkout de Whop", String(err));
  }
}

// El cuerpo del webhook no tiene tipos en el SDK: validamos solo lo que usamos.
const MoneyLike = z.union([
  z.number(),
  z.string().transform(Number),
  z.object({ amount: z.string() }).loose().transform((m) => Number(m.amount)),
]);

export const WhopWebhook = z
  .object({
    id: z.string().optional(),
    type: z.string(),
    data: z
      .object({
        id: z.string(),
        status: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
        plan_id: z.string().nullable().optional(),
        checkout_configuration_id: z.string().nullable().optional(),
        total: MoneyLike.nullable().optional(),
        usd_total: MoneyLike.nullable().optional(),
      })
      .loose(),
  })
  .loose();
export type WhopWebhook = z.infer<typeof WhopWebhook>;

/** Verifica la firma Standard Webhooks y devuelve el evento validado. Lanza si no es válido. */
export function verifyWhopWebhook(rawBody: string, headers: Record<string, string>) {
  const body = unwrapWebhook(rawBody, { headers, key: required("WHOP_WEBHOOK_SECRET") });
  return { eventId: headers["webhook-id"] ?? "", event: WhopWebhook.parse(body) };
}
