import { baseLanguage, type Brief } from "@bc/shared";

// Mapa idioma/mercado → filtros de Terac (doc 04). Los slugs y valores salen de
// `pnpm terac:filters` (GET /filters y /filters/{slug}/options); un slug
// desconocido hace fallar POST /opportunities, así que aquí solo van los
// confirmados. Mientras esté vacío, la oportunidad usa unrestricted_audience.

type TeracFilter = Record<string, Record<string, number | string | string[]>>;

const COUNTRY_FILTER_SLUG: string | null = null; // p. ej. "multi_select--country" [verificar con terac:filters]
const LANGUAGE_FILTER_SLUG: string | null = null; // p. ej. "multi_select--language" [verificar con terac:filters]
const LANGUAGE_VALUES: Record<string, string> = {}; // "en" → valor de la opción de Terac

export function filtersFor(brief: Brief): TeracFilter[] {
  const filters: TeracFilter[] = [];
  if (COUNTRY_FILTER_SLUG) filters.push({ [COUNTRY_FILTER_SLUG]: { $in: [brief.target_market.country.toUpperCase()] } });
  const lang = LANGUAGE_VALUES[baseLanguage(brief.target_language)];
  if (LANGUAGE_FILTER_SLUG && lang) filters.push({ [LANGUAGE_FILTER_SLUG]: { $in: [lang] } });
  return filters;
}
