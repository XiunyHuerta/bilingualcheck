# 09 · Despliegue en Vercel y variables de entorno

Estado a 2026-10-24. Dos proyectos de Vercel (equipo `xiu17`) enlazados al mismo repositorio de GitHub (`XiunyHuerta/bilingualcheck`, privado): cada push a `main` despliega los dos en producción, y cualquier otra rama genera previews.

**Actualización 2026-10-24:** Supabase está accesible mediante el conector y Vercel mediante la CLI. El proyecto `uwsaiolacxpmbgtkxyqk` está saludable, tiene las once tablas y los dos buckets privados. Se creó el rol de conexión `bilingualcheck_api`, limitado a SELECT/INSERT/UPDATE de las tablas de la aplicación, sin acceso al esquema `auth`, creación de roles ni bypass de RLS. Sus políticas solo se aplican a este rol de servidor. La contraseña y la clave de sesión se guardan en archivos ignorados y variables Secret de Production, nunca en este documento ni en Git.

El backend usa una clave de sesión propia. `EXPO_PUBLIC_SUPABASE_REALTIME_ENABLED=false` mantiene el sondeo autenticado de la API, sin intentar reutilizar esos JWT en Realtime. La clave de Storage se exige al utilizar archivos, por separado del login. Whop está configurado en **producción** con OAuth público + PKCE y callbacks web/local/nativo. El usuario creó el webhook y se guardó su secreto en el backend; la clave de empresa tiene los permisos de creación de checkout. No se ha realizado ningún cobro real.

Se aplicó también la actualización aditiva `0001` del repositorio: las columnas de entregas y los leases de webhooks faltaban en la base remota. Verificación real: conexión como rol dedicado, INSERT/SELECT con rollback, `/v1/me` y `/v1/projects` autenticados, recepción y procesamiento de un evento de diagnóstico firmado, rechazo de firmas ausentes y deduplicación. Se creó un checkout oculto para verificar la API de Whop y se eliminaron después tanto su configuración como su plan, sin pagar. El SDK requiere limitar los títulos de plan a 30 caracteres. La comprobación de tipos, lint (sin errores; una advertencia existente en i18n) y pruebas relevantes pasan. El login completo con consentimiento del usuario y un pago real no se han ejecutado.

El agente usa `gemini-3.6-flash` mediante `ai` + `@ai-sdk/google`, con `GEMINI_API_KEY` en `apps/api/.env` y como Secret de Vercel Production; `AGENT_MODEL` y `REVIEW_MODEL` seleccionan ese mismo modelo. Verificados con Google: llamada a `ask_client`, retorno de herramienta conservando firmas y revisión estructurada. No requiere clave de Anthropic. Despliegue `dpl_2H2k9tDVJAsZdWoMZzKesFcH71fQ` READY y alias principal actualizado; `/health` confirma el agente configurado. Comprobación en la web: el proyecto `372cc978-57c8-409c-bb65-b51be9e52160` recibió una respuesta del agente al retomar la conversación. Tipos, build, 144 pruebas de API y 10 pruebas de configuración pasan.

Pendientes fuera de la conexión con Whop: `SUPABASE_SERVICE_ROLE_KEY` para archivos. Estos secretos no están expuestos por las herramientas disponibles del conector de Supabase. La presencia de variables en `/health` no acredita por sí sola que una operación externa funcione.

| Proyecto | Carpeta | Qué sirve | URL pública de producción |
|----------|---------|-----------|---------------------------|
| `bilingualcheck-api` | `apps/api` | Backend Hono: agente, Terac, Whop, webhooks, cron | https://bilingualcheck-api.vercel.app |
| `bilingualcheck-app` | `apps/mobile` | La app Expo exportada a web (`expo export --platform web` → `dist`) | https://bilingualcheck-app.vercel.app |

- Las URLs por despliegue y las de preview piden login de Vercel (Vercel Authentication). **Los webhooks y los redirects siempre con las URLs de producción de arriba.**
- Las variables `EXPO_PUBLIC_*` se incrustan al **construir**: tras añadirlas hay que volver a desplegar la web.
- Las apps de iOS/Android no pasan por Vercel (EAS Build).

Leyenda de la tabla original: **Yo** = valor público conocido o recuperable; **Tú** = credencial pendiente. El usuario autorizó configurar también secretos mediante conectores o `.env` ignorados; no hace falta pegarlos en el chat. La limitación actual es la disponibilidad de las conexiones y valores, no una prohibición de configurar secretos.

## bilingualcheck-api

Production contiene la conexión dedicada de base de datos, la clave de sesión y la configuración de Whop. Valores actuales: `PUBLIC_API_URL=https://bilingualcheck-api.vercel.app`, `WHOP_ENV=production`, `TERAC_MODE=replay`. El conector de Vercel sigue sin acceso a este equipo; la CLI sí está autenticada.

La sesión, base de datos y URL de Supabase forman la configuración básica. Storage y el agente exigen sus propias claves al utilizarse; `/health` distingue cada grupo.

| Variable | Quién | De dónde sale |
|----------|-------|---------------|
| `SESSION_JWT_SECRET` | Configurada | Clave aleatoria propia de la API; Realtime desactivado en el cliente |
| `DATABASE_URL` | Configurada | Pooler de Supabase (6543), rol dedicado `bilingualcheck_api` |
| `SUPABASE_URL` | Yo | Supabase → Settings → API → Project URL |
| `WEB_APP_URL` | Yo | Producción: `https://bilingualcheck-app.vercel.app`; local: `http://localhost:8081`. Origen exacto para OAuth/checkout |
| `SUPABASE_SERVICE_ROLE_KEY` | Tú | Supabase → Settings → API → service_role |
| `GEMINI_API_KEY` | Configurada en local y Production | Google AI Studio → API Keys |
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

## Pago demo sin cobro

`DEMO_PAYMENTS_ENABLED=true` está activado en local y Production. Solo funciona con `TERAC_MODE=replay` y una cotización `replay_` con precio. En el chat y la tarjeta de cotización aparece «Pago demo de Whop · Simular pago» durante `quoted` o `awaiting_payment`, incluso después de abrir Whop. `POST /v1/projects/:id/payment/demo` exige sesión y propietario, bloquea el proyecto en una transacción, acepta la cotización y registra un pago simulado con identidad `demo_payment_<project_id>`. No llama a Whop ni modifica el checkout pendiente. Los reintentos reutilizan el mismo pago.

La interfaz conserva un aviso de pago simulado y el agente recibe ese contexto. Una identidad demo nunca permite contratar profesionales reales si posteriormente se cambia Terac a `live`. Desactivar `DEMO_PAYMENTS_ENABLED` retira el botón y rechaza la ruta; el valor por defecto es `false`.

## Edición del brief en la conversación

Cada campo principal de la tarjeta ofrece Editar; «Editar brief» carga todos los datos como texto en el compositor. Guardar valida el brief y usa `POST /v1/projects/:id/brief/edit`, sin llamadas a Gemini. Cancelar restaura el borrador de conversación previo y un error conserva los cambios escritos. La API comprueba propietario, versión y que no haya un agente u oportunidad trabajando. Se permite corregir antes del pago y un pago demo aún sin contratar; un contrato pagado real utiliza su flujo de cambios.

Cambiar un brief anterior al pago invalida sus cotizaciones y requiere confirmación nueva. Un webhook tardío de un checkout sustituido registra el dinero recibido para revisión sin financiar el nuevo brief; el sondeo no reactiva cotizaciones sustituidas. La IA comunica por separado el agotamiento de cuota; editar/guardar funciona aunque Gemini no tenga cuota.

Verificación real de edición: un proyecto de la cuenta de integración cambió de público francés a sueco mediante la API publicada; la cotización anterior quedó `unavailable`, se publicó la tarjeta actualizada y otro propietario recibió 404. No se llamó a IA ni se cambió el brief del proyecto del cliente para esta prueba.
