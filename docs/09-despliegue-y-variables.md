# 09 · Despliegue en Vercel y variables de entorno

Estado a 2026-10-24. Dos proyectos de Vercel (equipo `xiu17`) enlazados al mismo repositorio de GitHub (`XiunyHuerta/bilingualcheck`, privado): cada push a `main` despliega los dos en producción, y cualquier otra rama genera previews.

**Actualización de esta sesión:** GitHub está accesible. Vercel devuelve 403 para `xiu17` y el listado de equipos está vacío; CLI sin login. Supabase, Whop y Terac no están conectados aquí aunque sí lo estaban en el chat anterior de Claude. No se han aplicado variables remotas nuevas ni la migración `0001`. Las variables públicas de Supabase y `WEB_APP_URL`/tope de gasto se guardaron en los `.env` locales ignorados; siguen faltando los secretos. El esquema inicial, RLS, buckets y Realtime se aplicaron en la sesión anterior al proyecto `uwsaiolacxpmbgtkxyqk`.

| Proyecto | Carpeta | Qué sirve | URL pública de producción |
|----------|---------|-----------|---------------------------|
| `bilingualcheck-api` | `apps/api` | Backend Hono: agente, Terac, Whop, webhooks, cron | https://bilingualcheck-api.vercel.app |
| `bilingualcheck-app` | `apps/mobile` | La app Expo exportada a web (`expo export --platform web` → `dist`) | https://bilingualcheck-app.vercel.app |

- Las URLs por despliegue y las de preview piden login de Vercel (Vercel Authentication). **Los webhooks y los redirects siempre con las URLs de producción de arriba.**
- Las variables `EXPO_PUBLIC_*` se incrustan al **construir**: tras añadirlas hay que volver a desplegar la web.
- Las apps de iOS/Android no pasan por Vercel (EAS Build).

Leyenda de la tabla original: **Yo** = valor público conocido o recuperable; **Tú** = credencial pendiente. El usuario autorizó configurar también secretos mediante conectores o `.env` ignorados; no hace falta pegarlos en el chat. La limitación actual es la disponibilidad de las conexiones y valores, no una prohibición de configurar secretos.

## bilingualcheck-api

En la última lectura remota de la sesión anterior constaban en Production: `PUBLIC_API_URL`, `CRON_SECRET`, `WHOP_ENV`, `TERAC_MODE`. No se ha podido volver a consultar esa lista desde este conector. Valores esperados: `PUBLIC_API_URL=https://bilingualcheck-api.vercel.app`, `WHOP_ENV=sandbox`, `TERAC_MODE=replay`.

Sin las cuatro primeras, casi todas las rutas responden 503 «NOT_CONFIGURED» (`/` y `/health` funcionan).

| Variable | Quién | De dónde sale |
|----------|-------|---------------|
| `SESSION_JWT_SECRET` | Tú | Supabase → Settings → API → JWT Settings (*legacy JWT secret*, ≥ 32 caracteres) |
| `DATABASE_URL` | Tú | Supabase → Connect → Transaction pooler (puerto 6543); lleva la contraseña |
| `SUPABASE_URL` | Yo | Supabase → Settings → API → Project URL |
| `WEB_APP_URL` | Yo | Producción: `https://bilingualcheck-app.vercel.app`; local: `http://localhost:8081`. Origen exacto para OAuth/checkout |
| `SUPABASE_SERVICE_ROLE_KEY` | Tú | Supabase → Settings → API → service_role |
| `ANTHROPIC_API_KEY` | Tú | console.anthropic.com → API Keys |
| `TERAC_API_KEY` | Tú | https://terac.com/billingualcheck-mvmmsxgs/settings/api-keys |
| `TERAC_PROJECT_ID` | Yo | `k5s8jjzz2jm1poqfnxgmoqn6` (proyecto «BilingualCheck»; ya está en tu `.env` local) |
| `TERAC_WEBHOOK_SECRET` | Tú | `pnpm terac:webhooks` lo guarda en `.env`; configurar Vercel/redeploy y después `--confirm <id>` |
| `TERAC_DEMO_FEASIBILITY_REQUEST_ID` | Yo | id de la cotización real cuando Terac la responda (`aofdghee04nvdgbp5gxs2zlq`) |
| `WHOP_CLIENT_ID` | Yo | Whop sandbox → Developer → tu app (`app_…`) |
| `WHOP_CLIENT_SECRET` | Tú | misma app; solo si es confidencial (se puede dejar vacío si no hay secreto) |
| `WHOP_API_KEY` | Tú | https://sandbox.whop.com/dashboard/developer → crear API key |
| `WHOP_ACCOUNT_ID` | Yo | `biz_…`: Dashboard → Settings |
| `WHOP_PRODUCT_ID` | Yo | `prod_…`: Dashboard → Products |
| `WHOP_WEBHOOK_SECRET` | Tú | Developer → Create webhook → columna *Secret* (`ws_…`, tal cual) |

Opcionales (ya tienen valor por defecto): `APP_SCHEME`, `STORAGE_BUCKET_UPLOADS`, `STORAGE_BUCKET_DELIVERABLES`, `AGENT_MODEL`, `REVIEW_MODEL`, `AGENT_MAX_TOOL_CALLS`, `TERAC_BASE_URL`, `FEE_RATE` (0.25).
`BUDGET_CAP_USD` vale 300 por defecto y limita el total al cliente. `TERAC_SPEND_CAP_USD=100` limita el costo del proveedor por cotización, según el último saldo de Terac conocido; no hay comprobación actual del saldo. Así, un costo ilustrativo de 84 USD con comisión de 25 % da 105 USD al cliente y sigue cabiendo dentro del límite de gasto del proveedor. No se ha gastado saldo real.

Solo hay variables en el entorno Production. Si quieres probar ramas (previews), hay que repetirlas en Preview.

## bilingualcheck-app (web)

Ya están: `EXPO_PUBLIC_API_URL` (= la API de producción) y `EXPO_PUBLIC_WHOP_ENV` (= `sandbox`).

| Variable | Quién | De dónde sale |
|----------|-------|---------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yo | la misma `SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yo | Supabase → Settings → API → anon (pública por diseño; RLS la protege) |
| `EXPO_PUBLIC_WHOP_CLIENT_ID` | Yo | el mismo `WHOP_CLIENT_ID` |

Ningún secreto va aquí: todo lo que empieza por `EXPO_PUBLIC_` acaba en el bundle.

## Whop (sandbox): qué configurar

1. Crear la cuenta de pruebas en https://sandbox.whop.com (API: `https://sandbox-api.whop.com/api/v1`).
2. Developer → crear **API key** → `WHOP_API_KEY`.
3. Crear la **app OAuth** → `client_id` (`app_…`) y, si lo hay, `client_secret`. Alcances `openid profile email`. Registrar los *redirect URIs* exactos:
   - web: `https://bilingualcheck-app.vercel.app/auth/callback` (y `http://localhost:8081/auth/callback` para desarrollo);
   - nativo: `https://bilingualcheck-api.vercel.app/v1/auth/whop/callback/native`; el puente HTTPS redirige a `bilingualcheck://auth/callback` dentro de la app. No hace falta registrar el esquema propio en Whop.
4. Crear el producto «Proyecto BilingualCheck» → `WHOP_PRODUCT_ID`; anotar `WHOP_ACCOUNT_ID` (`biz_…`).
5. Developer → **Create webhook** → `https://bilingualcheck-api.vercel.app/webhooks/whop` con `payment.succeeded`, `payment.failed` y `refund.created` → `WHOP_WEBHOOK_SECRET`. Enviar un evento de prueba desde el panel.
6. Probar con la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC).

Límites del sandbox: solo tarjetas, sin pagos a terceros (*payouts*), sin Whop Elements.

### Qué falta en Whop
- Intercambio JSON, callback web con PKCE/state y puente HTTPS nativo implementados y probados con mocks. Ver [doc 05](05-integracion-whop.md) para contrato y fuentes.
- Registrar app OAuth, sus URIs exactas, producto y webhook en el entorno sandbox. Completar los valores de la tabla.
- Confirmar login/checkout/webhooks reales en ese entorno; no basta con que los tests pasen.
- Reembolsos: no hay llamada a la API de Whop (se hacen a mano desde el panel); `refund.*` no se procesa.
- Todo está sin probar de punta a punta contra Whop.

## Comprobación y sincronización

`pnpm env:check --group all` lista únicamente nombres y preparación por grupos. `WHOP_CLIENT_SECRET` y `TERAC_DEMO_FEASIBILITY_REQUEST_ID` son opcionales. En replay no se exige una key de Terac; para recibir webhooks live sí hace falta su secreto. `pnpm env:plan` prepara una lista de nombres/destino de la API sin cambiar Vercel; el helper es de comprobación, no implementa `--apply`.

Tras completar credenciales: `pnpm db:migrate`, redeploy API/web y validar `/health.configuration` (presencia de valores, no conectividad). El token de sesión usa el secret legacy de Supabase para Realtime; no generar uno independiente y asumir que Supabase lo aceptará. La app conserva polling de respaldo.

El MCP de Whop (`https://mcp.whop.com/mcp`, se añade en Claude → Settings → Connectors) permitiría leer `biz_`/`prod_` y registrar el webhook. Antes hay que comprobar que llega al **sandbox**; si solo ve producción, se configura a mano en el panel del sandbox.
