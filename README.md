# BilingualCheck

> *Tu negocio merece ser entendido.* — Agente de IA que contrata profesionales reales por **Terac** y cobra con **Whop**. Planificación completa en [`docs/`](docs/README.md).

**Demo para el jurado:** [bilingualcheck-app.vercel.app](https://bilingualcheck-app.vercel.app/). La portada es pública, incluso con una sesión iniciada. El panel de la cuenta está en `/dashboard`.

El recorrido conserva seis pasos: conversación con IA, brief, cotización, pago, trabajo y entrega. Para evaluar sin cargos, selecciona **Pago demo de Whop · Simular pago** y luego **Simular entrega del profesional**. La conversación y la revisión usan Gemini; la contratación y el trabajo de Terac se identifican como simulados. [Guía de evaluación y comprobaciones](docs/12-demo-jurado.md).

```
apps/api        Hono (Vercel) · Drizzle + Supabase · agente Gemini · Terac · Whop
apps/mobile     Expo SDK 58 · Expo Router (src/app) · React Query · Realtime · iOS, Android y web
packages/shared Estados y transiciones, esquemas zod, idiomas BCP-47, precio
vendor/terac    openapi.json de Terac v2 (beta) descargado el día 0
docs/           Planificación, despliegue (09), entregas (10) y guía de estilo UI
```

## Plan inicial de implementación (referencia)

La tabla siguiente conserva el plan original. El estado de la demo y sus límites actuales se documentan en [la guía del jurado](docs/12-demo-jurado.md).

> **Fase actual: 5 de 6 — Contratación y entregas (en curso).** Actualizado el 2026-10-24.
> La fase 5 ya incluye portal de entrega textual, revisión con IA, correcciones y descarga. Falta validar el circuito con cuentas reales. La configuración de servicios sigue incompleta; tener código o un despliegue `READY` no acredita que login, pagos o contratación funcionen.

| Fase | Qué cubre | Estado | Qué falta |
|------|-----------|--------|-----------|
| 1 · Esqueleto conectado | Monorepo, API y web en Vercel, Supabase, login con Whop | 🟡 Integración pendiente | Supabase inicial se aplicó en la sesión anterior (11 tablas, RLS, buckets, Realtime). Faltan credenciales y la migración nueva; login real sin verificar |
| 2 · Brief y materiales | Herramientas `ask_client` / `save_brief`, subida con URL firmada, tarjetas de respuestas rápidas y brief | ✅ Código listo · 🟡 sin validar | Pruebas de conversación en 3 pares de idiomas (es→en, pt→en, ko→es) |
| 3 · Cotización con Terac | Cliente REST, `request_quote`, cron `/cron/poll-quotes`, modo `replay`, tarjeta de cotización | ✅ Código listo · 🟡 sin validar | API key de Terac en `apps/api/.env`; cotización real y webhooks. Ya están: proyecto «BilingualCheck» en Terac y filtros de país e idioma |
| 4 · Pago con Whop | OAuth web con PKCE/state, puente HTTPS nativo, checkout por plataforma y webhooks recuperables | 🟡 Código y tests listos | App/producto/API key/webhook del sandbox y pago de prueba real |
| **5 · Contratación y entregas** | Oportunidad en Terac, webhooks, revisión con IA, entrega y aprobación | 🟡 **En curso** | Ver detalle abajo |
| 6 · Pulido y demo | i18n, estados vacíos/errores, datos de demo, video, diapositivas | 🟡 Empezada | Datos de demo, diapositivas, ensayos |

**Fase 5, al detalle**

- ✅ `create_opportunity` + `launch_opportunity`, webhook `/webhooks/terac` con HMAC, sincronización de entregas, `POST …/submissions/:sid/decision` (aprobar / pedir cambios).
- ✅ App: tarjeta de **entrega**, pantalla de **revisión** (profesional, evaluación de la IA, criterios, aprobar / pedir cambios) y **línea de tiempo** del proyecto.
- ✅ Backend: el profesional entrega los textos desde un portal privado; cada versión se conserva en Storage. `reviewSubmission` se ejecuta al tener contenido y estado `awaiting_review` de Terac, y publica la tarjeta `delivery` con su explicación.
- ✅ Correcciones en el mismo portal: se muestra el feedback, se recibe otra versión y se vuelve a revisar. Pedir cambios no aprueba, rechaza ni contrata otro trabajo automáticamente. **La coordinación y finalización de tarea con Terac aún requieren prueba real.**
- ✅ Aprobación ligada al proyecto propietario y a la última versión revisada; texto y archivo descargable en la app. Webhooks fallidos recuperables por mantenimiento, sin publicar dos veces la misma revisión.
- ⬜ Entregables binarios del profesional (PDF, imágenes, DOCX): el MVP recibe texto; la app sigue aceptando imágenes/PDF como materiales del cliente.
- ⬜ Notificaciones push (`expo-notifications`, requiere *development build*).

**Fase 6, lo hecho**: sistema de diseño, es/en/pt, estados de carga/error y etiqueta «Demo conceptual» en replay; semilla idempotente con proyectos de ejemplo y CI (tipos, tests, lint, compilación API/web). El video de concepto está en `video/`, ignorado por git; no acredita un recorrido real de la app.

### Diseño de la app

La interfaz sigue [`docs/styleUIguide.md`](docs/styleUIguide.md): paleta cobalt/sky/gold/cream/coral/sage/ink, Manrope (títulos) + DM Sans (texto), radios 30/22/14, sombras suaves y movimiento de entrada/pop/marcador. Los tokens viven en `apps/mobile/src/theme/tokens.ts` y los componentes en `apps/mobile/src/components/` (`ui`, `cards`, `chat`, `stepper`, `motion`). Los logos y la ilustración salen de `apps/mobile/assets/brand/` (copia de `public/brand/`). Para verla en el navegador: `pnpm dev:mobile` y pulsar `w`.

La web adapta la distribución al ancho de la ventana: desde 768 px muestra cuadrículas, desde 1024 px incorpora navegación superior y paneles en columnas, y desde 1440 px muestra tres proyectos o cuatro idiomas por fila. El contenido crece hasta 1280 px; las pantallas de confirmación mantienen un ancho de lectura reducido. Los puntos de corte están en `apps/mobile/src/theme/responsive.ts`. El portal del profesional también distribuye el brief y la entrega en dos columnas en escritorio.

## Puesta en marcha

```bash
pnpm install
pnpm env:check          # dice qué variables faltan en apps/api/.env y apps/mobile/.env
pnpm env:check --group all # incluye AI, OAuth y pagos; las opcionales no bloquean
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
| `GEMINI_API_KEY` | aistudio.google.com |
| `TERAC_API_KEY` | Terac → organización → API keys (la creas tú; solo va en `apps/api/.env`) |
| `TERAC_PROJECT_ID` | `pnpm terac:setup`: comprueba la clave, busca o crea el proyecto «BilingualCheck» y lo guarda en `.env` |
| `TERAC_WEBHOOK_SECRET` | `pnpm terac:webhooks` lo guarda localmente; configurar Vercel y confirmar con `--confirm <id>` |
| `WHOP_*` | Whop Developer Dashboard, en **sandbox**: app OAuth (client id), API key, `biz_…`, `prod_…`, webhook |
| `CRON_SECRET` | Ya generado en `apps/api/.env`; copiarlo también a Vercel |

Sin claves, el backend arranca y `/health` responde con un diagnóstico de presencia de configuración (no prueba conectividad). `TERAC_MODE=replay` simula Terac: costo ilustrativo 84 USD, total con comisión 25 % = 105 USD. `TERAC_SPEND_CAP_USD=100` limita el costo del proveedor por cotización; `BUDGET_CAP_USD=300` limita el total al cliente. No son el mismo límite ni representan una reserva acumulada de saldo.

## Qué confirmamos de los puntos [verificar]

- **Terac `POST /feasibility/requests`**: el cuerpo es `taskDescription` + `panelDescription` (+ `submissionCount`, `timelineHours`, `payRateFrequency`, `loiMinutes`). Respuesta con `status` `RECEIVED → RESPONDED` (o `LOST`/`NOT_PURSUED`) y `costPerParticipant` como string.
- **Terac sandbox**: existe `POST /opportunities/{id}/test-submissions`, que simula un profesional y dispara los webhooks reales firmados. Útil para la fase 5 sin gastar.
- **Terac `screening_questions`** usa `text` + `pick`, no `question`.
- **Terac entregas**: el MVP usa una tarea `interview` con `task_url` a nuestro portal. Terac añade `teracSubmissionId`/`submissionId`; la API comprueba la oportunidad antes de leer o guardar contenido. La revisión nunca inventa contenido ausente. Ver [entregas y migración](docs/10-entregas-y-validacion.md).
- **Whop checkout**: `checkoutConfigurations.create` acepta `metadata` (se copia al pago y vuelve en el webhook), un `plan` en línea con `initial_price` y `redirect_url`. El webhook se verifica con `unwrapWebhook` de `@whop/sdk/helpers` (Standard Webhooks).
- **Whop sandbox**: checkout y OAuth usan los hosts documentados del sandbox. El código usa JSON, valida el callback web y tiene puente HTTPS nativo; falta comprobar las credenciales y los flujos reales de la cuenta. Ver [doc 05](docs/05-integracion-whop.md).

## Pendiente

- Reconectar Supabase y Vercel al equipo `xiu17` en esta sesión, completar credenciales y aplicar `0001_flawless_scarlet_spider.sql` mediante `pnpm db:migrate`. Las migraciones iniciales se aplicaron en la sesión anterior; la nueva aún no.
- **Vercel Cron cada minuto requiere plan Pro**; en Hobby, usar un cron externo contra `/cron/poll-quotes` con `CRON_SECRET`. En local, `pnpm dev:api` ya sondea cada 30 s.
- Terac, en orden: 1) crear la API key en la misma organización (la del conector) y ponerla en `TERAC_API_KEY`; 2) `pnpm terac:setup --check` para comprobar la clave y el `TERAC_PROJECT_ID` (el proyecto «BilingualCheck» ya existe y su ID ya está en `.env`); 3) `pnpm terac:webhooks` con la API desplegada; 4) pedir una cotización real y guardar su id en `TERAC_DEMO_FEASIBILITY_REQUEST_ID`; 5) `TERAC_MODE=live` solo cuando quieras gastar saldo real (hoy hay US$ 100 de saldo).
- Filtros de Terac: país (`multi_select--country`) e idioma principal (`multi_select--language`, con la tabla de las 184 opciones en `apps/api/src/terac/filters.ts`) ya están confirmados contra la API.
- Fase 5: validar la entrega del profesional, finalización en Terac, revisión y aprobación reales con el sandbox. Los textos ya tienen flujo de recepción/revisión/corrección.
- Fase 6: ejecutar `pnpm demo:seed --user-id=<uuid>` después del primer login, diapositivas y ensayos; push nativo pendiente.
- Probar la app con una cuenta real en dispositivo: la UI nueva se revisó en el navegador (web) contra una API simulada, no en iOS/Android.
