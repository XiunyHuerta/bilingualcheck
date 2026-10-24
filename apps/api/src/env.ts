import { z } from "zod";

// Variables del backend (ver apps/api/.env.example). Se validan al primer uso,
// no al importar, para que los tests y los scripts no exijan todas las claves.

const optional = z.string().optional().transform((v) => (v ? v : undefined));

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  PUBLIC_API_URL: z.string().url().default("http://localhost:8787"),
  APP_SCHEME: z.string().default("bilingualcheck"),
  WEB_APP_URL: z.string().url().default("https://bilingualcheck-app.vercel.app"),

  SESSION_JWT_SECRET: z.string().min(32, "SESSION_JWT_SECRET debe tener al menos 32 caracteres"),

  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STORAGE_BUCKET_UPLOADS: z.string().default("client-uploads"),
  STORAGE_BUCKET_DELIVERABLES: z.string().default("deliverables"),

  ANTHROPIC_API_KEY: optional,
  AGENT_MODEL: z.string().default("claude-sonnet-5-5"),
  REVIEW_MODEL: z.string().default("claude-opus-5-5"),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(8),

  TERAC_MODE: z.enum(["live", "replay"]).default("replay"),
  TERAC_BASE_URL: z.string().url().default("https://terac.com/api/external/v2"),
  TERAC_API_KEY: optional,
  TERAC_PROJECT_ID: optional,
  TERAC_WEBHOOK_SECRET: optional,
  TERAC_DEMO_FEASIBILITY_REQUEST_ID: optional,

  WHOP_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  WHOP_CLIENT_ID: optional,
  WHOP_CLIENT_SECRET: optional,
  WHOP_API_KEY: optional,
  WHOP_ACCOUNT_ID: optional,
  WHOP_PRODUCT_ID: optional,
  WHOP_WEBHOOK_SECRET: optional,

  FEE_RATE: z.coerce.number().min(0).max(1).default(0.25),
  BUDGET_CAP_USD: z.coerce.number().positive().default(300),
  TERAC_SPEND_CAP_USD: z.coerce.number().positive().default(100),
  CRON_SECRET: optional,
});

export type Env = z.infer<typeof EnvSchema>;

/** Falta configuración del servidor: la API responde 503 en vez de un 500 genérico. */
export class ConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`Servidor sin configurar: faltan ${missing.join(", ")}`);
  }
}

// Solo lo que necesita el cliente de Terac: los scripts `terac:*` deben funcionar con la
// API key aunque Supabase, Whop o Anthropic todavía no estén configurados.
const TeracEnvSchema = EnvSchema.pick({
  TERAC_MODE: true,
  TERAC_BASE_URL: true,
  TERAC_API_KEY: true,
  TERAC_DEMO_FEASIBILITY_REQUEST_ID: true,
});

export function teracEnv() {
  const parsed = TeracEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new ConfigError([...new Set(parsed.error.issues.map((i) => i.path.join(".")))]);
  return parsed.data;
}

export function teracApiKey(): string {
  const key = teracEnv().TERAC_API_KEY;
  if (!key) throw new ConfigError(["TERAC_API_KEY"]);
  return key;
}

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new ConfigError([...new Set(parsed.error.issues.map((i) => i.path.join(".")))]);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Exige una variable opcional en el momento en que se necesita. */
export function required<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new ConfigError([String(key)]);
  }
  return value as NonNullable<Env[K]>;
}
