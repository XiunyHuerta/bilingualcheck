// Tokens del brand kit (doc 06). Texto sobre blueSoft, yellow y cream:
// siempre ink o blueDeep, nunca blanco (contraste AA).

export const colors = {
  blueDeep: "#315A9E", // primario: botones, encabezados
  blueSoft: "#A6CBEA", // fondos de tarjetas del agente
  yellow: "#F5C949", // acentos creativos, destacados
  cream: "#F5F0D7", // fondo general
  coral: "#D98178", // elementos humanos: profesionales, entregas
  green: "#548569", // éxito, conexión, estados completados
  ink: "#1E2A3A", // texto principal
  white: "#FFFFFF",
  muted: "#5B6676",
  border: "#E2DCC0",
} as const;

export const fonts = {
  heading: "Manrope_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
