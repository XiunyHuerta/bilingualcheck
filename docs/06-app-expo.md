# 06 · App móvil (React Native + Expo)

## Stack

| Necesidad | Librería |
|-----------|----------|
| Framework | Expo (SDK estable más reciente) + TypeScript |
| Navegación | **Expo Router** (rutas por archivos, deep links `bilingualcheck://`) |
| Datos del servidor | **TanStack Query** |
| Estado local | Zustand (sesión, borradores) |
| Tiempo real | `@supabase/supabase-js` (Realtime sobre `messages` y `projects`) |
| Login | `expo-auth-session` + `expo-crypto` (PKCE con Whop) |
| Sesión segura | `expo-secure-store` |
| Checkout | `expo-web-browser` + `expo-linking` |
| Archivos | `expo-document-picker`, `expo-image-picker` |
| Notificaciones | `expo-notifications` (push cuando hay cotización o entrega) |
| Idiomas | `expo-localization` + `i18next` / `react-i18next` |
| Formularios | `react-hook-form` + `zod` (esquemas compartidos de `packages/shared`) |
| Estilos | `StyleSheet` con tokens de marca (o NativeWind si el equipo lo prefiere) |
| Fuentes | `@expo-google-fonts/manrope`, `@expo-google-fonts/inter` |
| Builds | EAS Build (development build para probar deep links y OAuth) |

> Expo Go sirve para empezar, pero **OAuth y deep links se prueban en un development build** (`eas build --profile development`).

## Navegación (Expo Router)

```
app/
├─ _layout.tsx                 # Providers: QueryClient, i18n, fuentes, sesión
├─ (auth)/
│  ├─ welcome.tsx              # Propuesta de valor + elegir idioma de la interfaz
│  └─ sign-in.tsx              # "Continuar con Whop"
├─ auth/callback.tsx           # Recibe el redirect de OAuth
├─ (app)/
│  ├─ _layout.tsx              # Tabs: Proyectos · Perfil
│  ├─ index.tsx                # Lista de proyectos con estado
│  ├─ new.tsx                  # Crear proyecto → abre el chat
│  ├─ project/[id]/
│  │  ├─ index.tsx             # Chat con el agente + tarjetas (brief, cotización, entrega)
│  │  ├─ timeline.tsx          # Línea de tiempo del estado
│  │  ├─ files.tsx             # Materiales subidos y entregables
│  │  └─ delivery/[sid].tsx    # Revisión de una entrega: aprobar / pedir cambios
│  └─ profile.tsx              # Idioma, negocio, cerrar sesión
└─ checkout/return.tsx         # Vuelta desde Whop → "Confirmando pago…"
```

## Pantallas clave

### Chat del proyecto (`project/[id]`)

El centro de la app. Mensajes del agente y del cliente, más **tarjetas interactivas** según el estado:

| Tarjeta | Aparece en | Acciones |
|---------|-----------|----------|
| Respuestas rápidas | `intake` | Botones con opciones que propone el agente |
| **Brief** | `brief_ready` | "Confirmar" · "Corregir algo" |
| **Cotización** | `quoted` | Desglose (profesionales, plazo, qué incluye, total) · "Pagar con Whop" |
| Estado | `paid` → `in_progress` | Barra de progreso, "buscando profesional", "trabajando" |
| **Entrega** | `in_review` | Ver archivos, explicación de los cambios culturales, evaluación de la IA · "Aprobar" · "Pedir cambios" |
| Recomendación | `delivered` | "Tu web también podría mejorar" → nuevo proyecto |

Barra inferior: campo de texto + botón adjuntar (imagen, PDF, enlace).

### Flujo de datos del chat

1. El cliente envía → `POST /v1/projects/:id/messages` (optimista en la UI).
2. El backend guarda el mensaje y ejecuta el turno del agente.
3. Los mensajes del agente se insertan en `messages` → **Realtime** los empuja a la app.
4. Los cambios de `projects.status` también llegan por Realtime y cambian las tarjetas.

Así evitamos streaming por HTTP en React Native. Mientras el agente piensa, se muestra un indicador "escribiendo…" basado en `projects.agent_busy`.

## Internacionalización

- **Idioma de la interfaz**: detectado con `expo-localization`, editable en el perfil. Archivos `locales/<bcp47>.json`. Para el hackathon: `es`, `en` y uno más (p. ej. `pt` o `ko`) para demostrar que no es solo inglés/español.
- **Idioma de la conversación**: el agente responde en el idioma del cliente aunque la interfaz esté en otro.
- **Selector de idiomas del proyecto**: lista completa de idiomas (`Intl.DisplayNames` para mostrar el nombre en el idioma del usuario), sin banderas.
- Preparar textos para idiomas de derecha a izquierda (`I18nManager`) aunque no se activen en el MVP.

## Sistema de diseño (desde el brand kit)

```ts
// apps/mobile/src/theme/tokens.ts
export const colors = {
  blueDeep:   "#315A9E",  // primario: botones, encabezados
  blueSoft:   "#A6CBEA",  // fondos de tarjetas del agente
  yellow:     "#F5C949",  // acentos creativos, destacados
  cream:      "#F5F0D7",  // fondo general
  coral:      "#D98178",  // elementos humanos: profesionales, entregas
  green:      "#548569",  // éxito, conexión, estados completados
  ink:        "#1E2A3A",  // texto principal (a validar contraste)
};

export const fonts = {
  heading: "Manrope_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
};
```

Pautas:
- Símbolo: piezas modulares o burbujas de diálogo que encajan. **Sin banderas ni globos terráqueos genéricos**.
- Ilustraciones de manos que colaboran / piezas que encajan (negocio + IA + talento humano).
- Comprobar contraste AA: el texto sobre `blueSoft`, `yellow` y `cream` debe ser `ink` o `blueDeep`, nunca blanco.
- Modo oscuro: variante con `blueDeep` oscurecido como fondo; dejar para después del MVP si falta tiempo.

## Cliente de API

```ts
// apps/mobile/src/lib/api.ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await SecureStore.getItemAsync("session");
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (res.status === 401) { await signOut(); throw new Error("unauthorized"); }
  if (!res.ok) throw await res.json();
  return res.json();
}
```

Variables públicas (prefijo `EXPO_PUBLIC_`): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_WHOP_CLIENT_ID`. **Ningún secreto** en la app.

## Subida de archivos

1. `POST /v1/projects/:id/assets` → `{ asset_id, upload_url }` (URL firmada de Supabase Storage).
2. La app sube el archivo directamente a `upload_url`.
3. `POST /v1/projects/:id/assets/:asset_id/complete` → el agente lo "ve" en el siguiente turno (las imágenes se pasan a Claude como entrada de imagen; los PDF como documento).
