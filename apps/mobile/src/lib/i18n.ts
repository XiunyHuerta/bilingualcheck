import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import es from "../locales/es.json";
import pt from "../locales/pt.json";

// Idioma de la interfaz (doc 06). El idioma de la conversación es otro:
// el agente responde en el idioma del cliente aunque la UI esté en otro.

export const UI_LANGUAGES = ["es", "en", "pt"] as const;
const device = getLocales()[0]?.languageCode ?? "es";

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en }, pt: { translation: pt } },
  lng: (UI_LANGUAGES as readonly string[]).includes(device) ? device : "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

export default i18n;
