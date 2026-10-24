// Diagnóstico de presencia, sin valores ni llamadas de red. No acredita conectividad.
const present = (key: string) => {
  const value = (process.env[key] ?? "").trim();
  return value.length > 0 && !/[<>]/.test(value) && !/^(biz_|prod_)$/.test(value);
};

export function configurationReport() {
  const groups: Record<string, string[]> = {
    core: ["SESSION_JWT_SECRET", "DATABASE_URL", "SUPABASE_URL"],
    storage: ["SUPABASE_SERVICE_ROLE_KEY"],
    agent: ["GEMINI_API_KEY"],
    whop_login: ["WHOP_CLIENT_ID", "SESSION_JWT_SECRET", "DATABASE_URL"],
    whop_payments: ["WHOP_API_KEY", "WHOP_ACCOUNT_ID", "WHOP_PRODUCT_ID", "WHOP_WEBHOOK_SECRET"],
    terac: process.env.TERAC_MODE === "live" ? ["TERAC_API_KEY", "TERAC_PROJECT_ID", "TERAC_WEBHOOK_SECRET"] : [],
  };
  const report = Object.fromEntries(Object.entries(groups).map(([name, keys]) => {
    const missing = keys.filter((key) => !present(key));
    return [name, { configured: missing.length === 0, missing }];
  }));
  return { configured: Object.values(report).every((group) => group.configured), groups: report };
}
