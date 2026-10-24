import { baseLanguage, type Brief } from "@bc/shared";

// Mapa idioma/mercado → filtros de Terac (doc 04). Un slug desconocido hace fallar
// POST /opportunities, así que aquí solo van los confirmados contra la API de Terac
// (terac_list_filters y GET /filters/{slug}/options, 2026-10-24).

type TeracFilter = Record<string, Record<string, number | string | string[]>>;

// País de residencia: IDs ISO 3166-1 alpha-2 ("US"), operador `$in`.
const COUNTRY_FILTER_SLUG = "multi_select--country";
// Idioma principal: 184 opciones. Los 20 idiomas más hablados llevan región en el ID
// ("en-US"); el resto usa el código simple ("ht", "fil"). Terac no lista "tl": es "fil".
const LANGUAGE_FILTER_SLUG = "multi_select--language";

const REGIONAL_LANGUAGE_IDS: Record<string, string> = {
  en: "en-US", es: "es-ES", pt: "pt-BR", fr: "fr-FR", de: "de-DE", it: "it-IT", ja: "ja-JP",
  ko: "ko-KR", zh: "zh-CN", hi: "hi-IN", ru: "ru-RU", tr: "tr-TR", vi: "vi-VN", bn: "bn-BD",
  pa: "pa-IN", te: "te-IN", mr: "mr-IN", ta: "ta-IN", ur: "ur-PK", jv: "jv-ID", tl: "fil",
};

// IDs simples (164): todas las demás opciones de idioma de Terac.
export const PLAIN_LANGUAGE_IDS = new Set(
  `ab aa af ak sq am ar an hy as av ae ay az bm ba eu be bho bi bs br bg my yue ca ch ce cu cv kw co cr
  hr cs da dv nl dz eo et ee fo fj fil fi ff gl lg ka el gn gu ht ha he hz ho hu is io ig id ia ie iu ik
  ga kl kn kr ks kk km ki rw kv kg kj ku ky lo la lv li ln lt lu lb mk mg ms ml mt gv mi mh mn na nv ng
  ne nd se no nb nn ny oc or oj om os pi ps fa pl qu ro rm rn sm sg sa sc gd sr sn ii sd si sk sl so nr
  st su sw ss sv ty tg tt th bo ti to ts tn tk uk ug uz ve vo wa cy fy wo xh yi yo za zu`.split(/\s+/),
);

/** ID de la opción de idioma de Terac para una etiqueta BCP-47 ("pt-BR" → "pt-BR", "ht" → "ht"), o undefined. */
export function teracLanguageId(tag: string): string | undefined {
  const base = baseLanguage(tag);
  return REGIONAL_LANGUAGE_IDS[base] ?? (PLAIN_LANGUAGE_IDS.has(base) ? base : undefined);
}

const ISO_ALPHA2 = /^[A-Za-z]{2}$/;

export function filtersFor(brief: Brief): TeracFilter[] {
  const filters: TeracFilter[] = [];
  // El agente puede escribir un nombre de país en vez del código: sin código válido no se filtra
  // (la oportunidad queda más abierta, pero no falla en Terac con BAD_REQUEST).
  const country = brief.target_market.country.trim();
  if (ISO_ALPHA2.test(country)) filters.push({ [COUNTRY_FILTER_SLUG]: { $in: [country.toUpperCase()] } });
  const lang = teracLanguageId(brief.target_language);
  if (lang) filters.push({ [LANGUAGE_FILTER_SLUG]: { $in: [lang] } });
  return filters;
}
