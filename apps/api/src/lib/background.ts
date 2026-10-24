import { waitUntil } from "@vercel/functions";

/**
 * Ejecuta trabajo después de responder (turnos del agente, webhooks).
 * En Vercel mantiene viva la función con waitUntil; en local es fire-and-forget.
 */
export function runInBackground(label: string, task: () => Promise<unknown>) {
  const promise = task().catch((err) => console.error(`[background:${label}]`, err));
  try {
    waitUntil(promise);
  } catch {
    // Fuera de Vercel no hay contexto de petición: la promesa sigue viva igualmente.
  }
}
