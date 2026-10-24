import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

// En Vercel cada instancia abre pocas conexiones: usar el pooler de Supabase
// (puerto 6543, modo transacción), que no admite sentencias preparadas.
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!instance) {
    const sql = postgres(env().DATABASE_URL, { prepare: false, max: 5 });
    instance = drizzle(sql, { schema });
  }
  return instance;
}

export { schema };
