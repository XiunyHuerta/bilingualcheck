import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, required } from "../env";

let client: SupabaseClient | undefined;

function supabase() {
  client ??= createClient(env().SUPABASE_URL, required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  return client;
}

/** URL firmada para que la app suba el archivo directamente a Storage. */
export async function signedUploadUrl(bucket: string, path: string) {
  const { data, error } = await supabase().storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw error;
  return data.signedUrl;
}

/** URL firmada de descarga. Para los materiales que verá el profesional, 7 días. */
export async function signedDownloadUrl(bucket: string, path: string, expiresInSeconds = 60 * 10) {
  const { data, error } = await supabase().storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function download(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabase().storage.from(bucket).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

/** Conserva una copia inmutable del texto entregado en el bucket privado. */
export async function storeTextDelivery(path: string, text: string) {
  const { error } = await supabase().storage.from(env().STORAGE_BUCKET_DELIVERABLES)
    .upload(path, Buffer.from(text, "utf8"), { contentType: "text/plain; charset=utf-8", upsert: false });
  if (error) throw error;
}

/** Profile images stay in the private uploads bucket, with a fresh path per upload. */
export async function storeProfileImage(path: string, data: Uint8Array, contentType: string) {
  const { error } = await supabase().storage.from(env().STORAGE_BUCKET_UPLOADS)
    .upload(path, data, { contentType, upsert: false });
  if (error) throw error;
}
