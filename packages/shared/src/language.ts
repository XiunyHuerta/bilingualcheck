// Utilidades de idioma. Nada aquí asume inglés ↔ español:
// los idiomas son códigos BCP-47 libres ("es", "en-US", "pt-BR", "ko"…).

export function isValidLanguageTag(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

export function canonicalLanguageTag(tag: string): string {
  return Intl.getCanonicalLocales(tag)[0] ?? tag;
}

/** Nombre del idioma `tag` escrito en el idioma `displayIn` (p. ej. ko en es → "coreano"). */
export function languageName(tag: string, displayIn: string): string {
  try {
    return new Intl.DisplayNames([displayIn], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** Idioma base sin región: "pt-BR" → "pt". */
export function baseLanguage(tag: string): string {
  return canonicalLanguageTag(tag).split("-")[0]!.toLowerCase();
}
