import { jwtVerify, SignJWT } from "jose";
import { env } from "../env";

// Token exclusivo para entregar, nunca aceptado como sesión del cliente.
const key = () => new TextEncoder().encode(env().SESSION_JWT_SECRET);

export async function deliveryPortalUrl(projectId: string) {
  const token = await new SignJWT({ purpose: "delivery" })
    .setProtectedHeader({ alg: "HS256" }).setSubject(projectId)
    .setAudience("professional-delivery").setIssuedAt().setExpirationTime("30d").sign(key());
  const url = new URL("/professional/delivery", env().PUBLIC_API_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function verifyDeliveryToken(token: string) {
  const { payload } = await jwtVerify(token, key(), { audience: "professional-delivery", algorithms: ["HS256"] });
  if (payload.purpose !== "delivery" || !payload.sub) throw new Error("Enlace de entrega inválido");
  return payload.sub;
}
