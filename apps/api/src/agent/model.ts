import { createGoogle } from "@ai-sdk/google";
import { env, required } from "../env";

// La clave solo existe en el servidor. El mismo proveedor funciona en local y Vercel.
export function geminiModel(kind: "agent" | "review" | "interface" = "agent") {
  const google = createGoogle({ apiKey: required("GEMINI_API_KEY") });
  return google(kind === "interface" ? env().UI_TRANSLATION_MODEL : kind === "agent" ? env().AGENT_MODEL : env().REVIEW_MODEL);
}

export const geminiOptions = { google: { thinkingConfig: { thinkingLevel: "low" } } } as const;
