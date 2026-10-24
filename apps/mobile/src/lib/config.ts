// Variables públicas (EXPO_PUBLIC_*). Ningún secreto vive en la app.
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  whopClientId: process.env.EXPO_PUBLIC_WHOP_CLIENT_ID ?? "",
  whopOAuthBase:
    process.env.EXPO_PUBLIC_WHOP_ENV === "production" ? "https://api.whop.com" : "https://sandbox-api.whop.com",
};
