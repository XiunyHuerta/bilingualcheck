// Aplica las migraciones de drizzle/ y luego supabase/setup.sql (RLS, Realtime, buckets).
// Uso: pnpm db:migrate
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");

const sql = postgres(url, { prepare: false, max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
await sql.unsafe(readFileSync("supabase/setup.sql", "utf8"));
await sql.end();
console.log("✓ Migraciones y configuración de Supabase aplicadas");
