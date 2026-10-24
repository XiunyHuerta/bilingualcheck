// Tokens del brand kit (docs/styleUIguide.md). Un color por significado:
// cobalt = acción, sky = agente/IA, gold = acento y "en revisión", coral = humano/revisión
// pedida, sage = hecho, ink = texto. Sobre sky, gold y cream el texto va en ink o cobalt,
// nunca en blanco (contraste AA).

import type { ProjectStatus } from "@bc/shared";

export const colors = {
  cobalt: "#315A9E", // primario: botones, paso activo, mensajes del dueño
  sky: "#A6CBEA", // agente e IA
  gold: "#F5C949", // acentos y marcador
  cream: "#F5F0D7", // fondo general
  coral: "#D98178", // lo humano: profesionales, alertas suaves
  sage: "#548569", // éxito: completado, aprobado
  ink: "#202835", // texto principal y superficies oscuras

  paper: "#FFFDF7", // ventana
  sidebar: "#FBF8EC", // barras y tiras
  white: "#FFFFFF", // tarjetas

  skySoft: "#E7F0F9",
  goldSoft: "#FCF1CC",
  coralSoft: "#F7E2DE",
  sageSoft: "#E2EDE6",
  graySoft: "#F1F3F6",

  muted: "rgba(32, 40, 53, 0.62)", // texto secundario: ink al 62 %
  border: "rgba(32, 40, 53, 0.12)", // bordes: ink al 12 %
} as const;

// Estados: tinte suave + texto oscuro del mismo matiz. El texto es una variante más
// oscura del color de marca para llegar a contraste AA sobre su tinte.
export const tones = {
  sky: { bg: colors.skySoft, fg: colors.cobalt, solid: colors.sky },
  gold: { bg: colors.goldSoft, fg: "#7A5A00", solid: colors.gold },
  coral: { bg: colors.coralSoft, fg: "#9C4A41", solid: colors.coral },
  sage: { bg: colors.sageSoft, fg: "#3D6B52", solid: colors.sage },
  neutral: { bg: colors.graySoft, fg: "#4B5563", solid: colors.border },
} as const;
export type Tone = keyof typeof tones;

// Pills de estado de la guía: In progress (sky), In review (gold),
// Revision requested (coral), Done (sage), Next (gris).
export const STATUS_TONE: Record<ProjectStatus, Tone> = {
  intake: "sky",
  brief_ready: "gold",
  quoting: "sky",
  quoted: "gold",
  awaiting_payment: "gold",
  paid: "sky",
  recruiting: "sky",
  in_progress: "sky",
  in_review: "gold",
  revision: "coral",
  delivered: "sage",
  failed: "coral",
  refunded: "neutral",
};

export const fonts = {
  heading: "Manrope_800ExtraBold",
  headingBold: "Manrope_700Bold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodySemi: "DMSans_600SemiBold",
  bodyBold: "DMSans_700Bold",
  italic: "DMSans_400Regular_Italic",
} as const;

// Base de 4. Entre tarjetas 20–28; padding interno 18–26.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, card: 20 } as const;

export const radius = { window: 30, card: 22, field: 14, button: 14, chip: 12, pill: 999, tail: 6 } as const;

// Sombras suaves y difusas (`boxShadow` de React Native).
export const shadow = {
  card: "0 8px 24px rgba(32, 40, 53, 0.06)",
  active: "0 10px 24px rgba(49, 90, 158, 0.3)",
  window: "0 40px 100px rgba(32, 40, 53, 0.18)",
} as const;

// Ancho máximo de la columna de contenido (en web y tablets).
export const MAX_WIDTH = 640;
