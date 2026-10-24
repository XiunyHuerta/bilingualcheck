# BilingualCheck

> *Tu negocio merece ser entendido.* — Agente de IA que contrata profesionales reales por **Terac** y cobra con **Whop**. Planificación completa en [`docs/`](docs/README.md).

```
apps/api        Hono (Vercel) · Drizzle + Supabase · agente Claude · Terac · Whop
apps/mobile     Expo SDK 58 · Expo Router (src/app) · React Query · Realtime
packages/shared Estados y transiciones, esquemas zod, idiomas BCP-47, precio
vendor/terac    openapi.json de Terac v2 (beta) descargado el día 0
```

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
- Fase 5: revisión de entregas con Opus (`apps/api/src/agent/review.ts` ya existe), tarjeta y pantalla de entrega, correcciones.
