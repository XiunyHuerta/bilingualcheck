# BilingualCheck

> *Tu negocio merece ser entendido.* — Agente de IA que contrata profesionales reales por **Terac** y cobra con **Whop**. Planificación completa en [`docs/`](docs/README.md).

```
apps/api        Hono (Vercel) · Drizzle + Supabase · agente Claude · Terac · Whop
apps/mobile     Expo SDK 58 · Expo Router (src/app) · React Query · Realtime · iOS, Android y web
packages/shared Estados y transiciones, esquemas zod, idiomas BCP-47, precio
vendor/terac    openapi.json de Terac v2 (beta) descargado el día 0
docs/           Planificación (01–08) y guía de estilo UI (styleUIguide.md)
```

## Estado del proyecto

> **Fase actual: 5 de 6 — Contratación y entregas (en curso).** Actualizado el 2026-10-24.
> Las fases 1–4 tienen el código completo y typecheck/tests en verde; todavía no se han validado de punta a punta con claves reales. La fase 5 tiene la app lista y el backend a medias. La fase 6 (pulido) ya empezó por el diseño.

| Fase | Qué cubre | Estado | Qué falta |
|------|-----------|--------|-----------|
| 1 · Esqueleto conectado | Monorepo, Hono en Vercel, Drizzle + Supabase, Expo Router, login con Whop, turno básico del agente | ✅ Código listo · 🟡 sin validar con servicios reales | Claves reales, `pnpm db:migrate`, login en un *development build* |
| 2 · Brief y materiales | Herramientas `ask_client` / `save_brief`, subida con URL firmada, tarjetas de respuestas rápidas y brief | ✅ Código listo · 🟡 sin validar | Pruebas de conversación en 3 pares de idiomas (es→en, pt→en, ko→es) |
| 3 · Cotización con Terac | Cliente REST, `request_quote`, cron `/cron/poll-quotes`, modo `replay`, tarjeta de cotización | ✅ Código listo · 🟡 sin validar | Mapa de filtros de Terac (`terac/filters.ts` sigue vacío), cotización real |
| 4 · Pago con Whop | `quote/accept` → checkout, webhook `payment.succeeded`, pantalla `checkout/return` | ✅ Código listo · 🟡 sin validar | Pago de prueba en el sandbox de Whop |
| **5 · Contratación y entregas** | Oportunidad en Terac, webhooks, revisión con IA, entrega y aprobación | 🟡 **En curso** | Ver detalle abajo |
| 6 · Pulido y demo | i18n, estados vacíos/errores, datos de demo, video, diapositivas | 🟡 Empezada | Datos de demo, diapositivas, ensayos |

**Fase 5, al detalle**

- ✅ `create_opportunity` + `launch_opportunity`, webhook `/webhooks/terac` con HMAC, sincronización de entregas, `POST …/submissions/:sid/decision` (aprobar / pedir cambios).
- ✅ App: tarjeta de **entrega**, pantalla de **revisión** (profesional, evaluación de la IA, criterios, aprobar / pedir cambios) y **línea de tiempo** del proyecto.
- ⬜ Backend: `reviewSubmission` (Opus) existe en `agent/review.ts` pero **ningún flujo lo invoca todavía**, y el agente aún no publica la tarjeta `delivery`. Mientras tanto la app arma la tarjeta con los datos de la entrega y muestra «La IA todavía está revisando…».
- ⬜ Backend: ronda de correcciones (nueva oportunidad con el feedback del cliente) y decidir cómo llegan los archivos (ver *Terac entregas* abajo).
- ⬜ Notificaciones push (`expo-notifications`, requiere *development build*).

**Fase 6, lo hecho**: sistema de diseño de la marca aplicado a toda la app (ver más abajo), textos en es/en/pt, estados vacíos, de error y «el agente está escribiendo…», etiqueta «Demo conceptual» cuando Terac corre en `replay`, y un video demo en `video/`.

### Diseño de la app

La interfaz sigue [`docs/styleUIguide.md`](docs/styleUIguide.md): paleta cobalt/sky/gold/cream/coral/sage/ink, Manrope (títulos) + DM Sans (texto), radios 30/22/14, sombras suaves y movimiento de entrada/pop/marcador. Los tokens viven en `apps/mobile/src/theme/tokens.ts` y los componentes en `apps/mobile/src/components/` (`ui`, `cards`, `chat`, `stepper`, `motion`). Los logos y la ilustración salen de `apps/mobile/assets/brand/` (copia de `public/brand/`). Para verla en el navegador: `pnpm dev:mobile` y pulsar `w`.

## Puesta en marcha

```bash
pnpm install
pnpm env:check          # dice qué variables faltan en apps/api/.env y apps/mobile/.env
pnpm db:migrate         # migraciones + RLS, Realtime y buckets (supabase/setup.sql)
pnpm dev:api            # http://localhost:8787/health
pnpm dev:mobile         # Expo
```

Las plantillas son `apps/api/.env.example` y `apps/mobile/.env.example`. Los `.env` reales están en `.gitignore`.

### Dónde sale cada variable

| Variable | Dónde |
|----------|-------|
| `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → Database / API (usar el pooler, puerto 6543) |
| `SESSION_JWT_SECRET` | Supabase → Settings → API → JWT Settings (*legacy JWT secret*). Así Realtime + RLS aceptan nuestro JWT |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (anon key, es pública) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `TERAC_API_KEY`, `TERAC_PROJECT_ID` | Terac → organización. `TERAC_PROJECT_ID` se crea una vez con `POST /projects` |
| `TERAC_WEBHOOK_SECRET` | `pnpm terac:webhooks` (necesita `PUBLIC_API_URL` pública) |
| `WHOP_*` | Whop Developer Dashboard, en **sandbox**: app OAuth (client id), API key, `biz_…`, `prod_…`, webhook |
| `CRON_SECRET` | Ya generado en `apps/api/.env`; copiarlo también a Vercel |

Sin claves, el backend arranca y `/health` responde; `TERAC_MODE=replay` simula Terac (la cotización tarda 20 s y cuesta 84 USD).

## Qué confirmamos de los puntos [verificar]

- **Terac `POST /feasibility/requests`**: el cuerpo es `taskDescription` + `panelDescription` (+ `submissionCount`, `timelineHours`, `payRateFrequency`, `loiMinutes`). Respuesta con `status` `RECEIVED → RESPONDED` (o `LOST`/`NOT_PURSUED`) y `costPerParticipant` como string.
- **Terac sandbox**: existe `POST /opportunities/{id}/test-submissions`, que simula un profesional y dispara los webhooks reales firmados. Útil para la fase 5 sin gastar.
- **Terac `screening_questions`** usa `text` + `pick`, no `question`.
- **Terac entregas**: `GET /submissions/{id}` **no devuelve los archivos** de una tarea `file_upload` (solo estado, perfil y tareas). Para que la IA revise el contenido, la alternativa robusta es una tarea `interview` con `task_url` a una página nuestra donde el profesional entrega el trabajo. Decidir antes de la fase 5.
- **Whop checkout**: `checkoutConfigurations.create` acepta `metadata` (se copia al pago y vuelve en el webhook), un `plan` en línea con `initial_price` y `redirect_url`. El webhook se verifica con `unwrapWebhook` de `@whop/sdk/helpers` (Standard Webhooks).
- **Whop sandbox**: la API está en `https://sandbox-api.whop.com/api/v1`. Las URLs OAuth del sandbox se asumen en `sandbox-api.whop.com/oauth/*` — confirmar en el panel.

## Pendiente

- Claves reales y `pnpm db:migrate` contra Supabase; probar el login con Whop en un **development build** (`eas build --profile development`).
- **Vercel Cron cada minuto requiere plan Pro**; en Hobby, usar un cron externo contra `/cron/poll-quotes` con `CRON_SECRET`. En local, `pnpm dev:api` ya sondea cada 30 s.
- Mapa de filtros de Terac (`pnpm terac:filters` → `apps/api/src/terac/filters.ts`).
- Fase 5 (backend): invocar `reviewSubmission` (`apps/api/src/agent/review.ts`) al recibir una entrega, publicar la tarjeta `delivery` desde el agente y la ronda de correcciones. La tarjeta, la pantalla de revisión y la línea de tiempo ya están en la app.
- Fase 6: datos de demo, diapositivas, ensayos; notificaciones push (requieren *development build*).
- Probar la app con una cuenta real en dispositivo: la UI nueva se revisó en el navegador (web) contra una API simulada, no en iOS/Android.
