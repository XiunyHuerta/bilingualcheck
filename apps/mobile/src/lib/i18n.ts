import { getLocales } from "expo-localization";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import es from "../locales/es.json";
import pt from "../locales/pt.json";
import { v2 } from "../locales/v2";
import { refinements } from "../locales/refinements";
import { menuTeam } from "../locales/menu-team";
import { recognizedUILanguage, UI_LANGUAGE_CODES, UI_TRANSLATION_VERSION } from "@bc/shared";
import { config } from "./config";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Idioma de la interfaz (doc 06). El idioma de la conversación es otro:
// el agente responde en el idioma del cliente aunque la UI esté en otro.

export const BASE_UI_LANGUAGES = ["es", "en", "pt"] as const;
export const UI_LANGUAGES = UI_LANGUAGE_CODES;
const i18n = createInstance();
export function deviceUILanguage() {
  const locales = Platform.OS === "web" && typeof navigator !== "undefined"
    ? [...navigator.languages, navigator.language] : getLocales().map(locale => locale.languageTag);
  for (const locale of locales) {
    const language = recognizedUILanguage(locale);
    if (!language) continue;
    const base = language.split("-")[0]!;
    return (BASE_UI_LANGUAGES as readonly string[]).includes(base) ? base : language;
  }
  return "en";
}
const device = deviceUILanguage();
let savedLanguage: string | null = null;
try { if (Platform.OS === "web") savedLanguage = localStorage.getItem("bc.ui-language.manual.v2"); } catch { /* storage unavailable */ }

void i18n.use(initReactI18next).init({
  resources: { es: { translation: { ...es, v2: v2.es, refinements: refinements.es, menuTeam: menuTeam.es } }, en: { translation: { ...en, v2: v2.en, refinements: refinements.en, menuTeam: menuTeam.en } }, pt: { translation: { ...pt, v2: v2.pt, refinements: refinements.pt, menuTeam: menuTeam.pt } } },
  lng: savedLanguage && (BASE_UI_LANGUAGES as readonly string[]).includes(savedLanguage) ? savedLanguage : (BASE_UI_LANGUAGES as readonly string[]).includes(device) ? device : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
type TranslationEntry = { path: (string | number)[]; text: string };
const loading = new Map<string, Promise<void>>();
const cacheKey = (language: string) => `bc.ui-translation.${UI_TRANSLATION_VERSION}.${language}`;
export async function changeUILanguage(input: string, automatic = false) {
  const language = recognizedUILanguage(input);
  if (!language) throw new Error("Unknown interface language");
  if (!i18n.hasResourceBundle(language, "translation")) {
    let request = loading.get(language);
    if (!request) {
      request = (async () => {
        let cached: string | null = null;
        try { if (Platform.OS === "web") cached = localStorage.getItem(cacheKey(language)); } catch { /* optional cache */ }
        if (cached) {
          try {
            const value = JSON.parse(cached);
            if (value && typeof value === "object" && !Array.isArray(value) && value.menuTeam && value.v2 && value.profile) {
              i18n.addResourceBundle(language, "translation", value); return;
            }
          } catch { /* reload an invalid cache */ }
        }
        async function chunk(index: number) {
          const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 80_000);
          try {
            const response = await fetch(`${config.apiUrl}/v1/localization/${encodeURIComponent(language!)}/${index}?v=${UI_TRANSLATION_VERSION}`, { signal: controller.signal });
            if (!response.ok) throw new Error("Language loading failed");
            const result = await response.json() as { language: string; version: string; total: number; entries: TranslationEntry[] };
            if (result.language !== language || result.version !== UI_TRANSLATION_VERSION || !Number.isInteger(result.total) || result.total < 1 || result.total > 40 || !Array.isArray(result.entries)) throw new Error("Invalid language bundle");
            return result;
          } finally { clearTimeout(timeout); }
        }
        const first = await chunk(0);
        const entries = [...first.entries];
        let cursor = 1;
        async function worker() { while (cursor < first.total) { const index = cursor++; entries.push(...(await chunk(index)).entries); } }
        await Promise.all([worker(), worker()]);
        const bundle = JSON.parse(JSON.stringify(i18n.getResourceBundle("en", "translation")));
        for (const entry of entries) {
          if (!Array.isArray(entry.path) || typeof entry.text !== "string" || !entry.path.length || entry.path.some(key => ["__proto__", "constructor", "prototype"].includes(String(key)))) throw new Error("Invalid translation entry");
          let node = bundle;
          for (const key of entry.path.slice(0, -1)) { node = node[key]; if (!node || typeof node !== "object") throw new Error("Invalid translation path"); }
          node[entry.path[entry.path.length - 1]!] = entry.text;
        }
        i18n.addResourceBundle(language, "translation", bundle);
        try { if (Platform.OS === "web") localStorage.setItem(cacheKey(language), JSON.stringify(bundle)); } catch { /* cache is optional */ }
      })();
      loading.set(language, request);
    }
    try { await request; } finally { loading.delete(language); }
  }
  await i18n.changeLanguage(language);
  if (!automatic) {
    try { if (Platform.OS === "web") localStorage.setItem("bc.ui-language.manual.v2", language); } catch { /* storage unavailable */ }
    if (Platform.OS !== "web") await SecureStore.setItemAsync("bc.ui-language.manual.v2", language).catch(() => undefined);
  }
}

export async function restoreUILanguage() {
  const manual = Platform.OS === "web" ? savedLanguage : await SecureStore.getItemAsync("bc.ui-language.manual.v2").catch(() => null);
  await changeUILanguage(manual && recognizedUILanguage(manual) ? manual : deviceUILanguage(), true).catch(() => undefined);
}

export async function followDeviceLanguage() {
  await changeUILanguage(deviceUILanguage(), true);
  savedLanguage = null;
  try { if (Platform.OS === "web") localStorage.removeItem("bc.ui-language.manual.v2"); } catch { /* storage unavailable */ }
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync("bc.ui-language.manual.v2").catch(() => undefined);
}

export default i18n;
