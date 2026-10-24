import type { Context } from "hono";
import type { z } from "zod";
import { ApiError } from "./errors";

export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "El cuerpo debe ser JSON");
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Datos inválidos", parsed.error.issues);
  return parsed.data;
}
