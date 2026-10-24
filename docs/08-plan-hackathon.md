# 08 · Plan de trabajo del hackathon

Plan pensado para **~48 horas** y un equipo de 3–4 personas. Si el hackathon es más corto, recortar desde el final: la prioridad es que el **camino feliz de la demo** funcione de punta a punta.

## Seguimiento real · 2026-10-24

**Fase de desarrollo: 5 de 6; validación de integración pendiente de credenciales/conexiones de las fases 1 y 4.** El estado de código no equivale al cumplimiento de los hitos con servicios reales.

| Fase | Implementado | Validación pendiente |
|---|---|---|
| 1 | Monorepo, API/web en Vercel, SQL inicial aplicada en Supabase en sesión anterior; OAuth web con callback y puente nativo | Completar variables, aplicar migración nueva, login y conversación reales |
| 2 | Brief, confirmación, adjuntos y respuestas rápidas | Probar es→en, pt→en y ko→es contra Claude |
| 3 | Cliente Terac, filtros confirmados, proyecto real creado, cotización Miami enviada, polling con límite | API key y respuesta actual de la cotización; no hay precio confirmado |
| 4 | Checkout por plataforma, firma y atribución de pagos, webhooks reintentables | Recursos Whop sandbox y pago/reintento/cancelación reales |
| 5 | Portal textual del profesional, archivo privado, revisión IA versionada, tarjeta, descarga, correcciones y aprobación autorizada | Recorrido real Terac/Storage/IA; finalización en Terac; entregables binarios y push |
| 6 | Diseño, es/en/pt, estados, CI, semilla idempotente y video conceptual local | Ejecutar semilla tras login, diapositivas, grabación del recorrido real y ensayos |

Siguiente orden: conexiones/credenciales → `pnpm db:migrate` → OAuth Whop → conversación → cotización/pago sandbox → entrega y corrección → aprobación → ensayos. Procedimiento y límites en [doc 09](09-despliegue-y-variables.md) y [doc 10](10-entregas-y-validacion.md).

## Reparto sugerido

| Rol | Se encarga de |
|-----|---------------|
| **Móvil** | App Expo: navegación, chat, tarjetas, login, checkout, diseño |
| **Backend** | Hono, base de datos, webhooks, cron, clientes de Terac y Whop |
| **Agente** | Prompts, herramientas, revisión de entregas, pruebas de conversación en varios idiomas |
| **Producto / pitch** (puede ser compartido) | Guion de demo, datos de la demo, diapositivas, video de respaldo |

## Antes de empezar (día 0, ≈2 h)

- [ ] Crear cuentas y claves: Anthropic, Terac (organización + API key), Whop (app, producto, **sandbox**), Supabase, Vercel, Expo/EAS.
- [x] **Cotización real enviada** en Terac: `aofdghee04nvdgbp5gxs2zlq`, pendiente de respuesta confirmada.
- [ ] Descargar `openapi.json` de Terac y confirmar los puntos **[verificar]** de los docs 04 y 05.
- [x] Repositorio monorepo con `pnpm` (`apps/mobile`, `apps/api`, `packages/shared`).

## Fases

### Fase 1 · Esqueleto conectado (h 0–6)

| Tarea | Rol |
|-------|-----|
| `create-expo-app` con Expo Router, fuentes Manrope/Inter, tokens de color | Móvil |
| Hono en Vercel con `/health`, Drizzle + migraciones de las tablas del doc 07 | Backend |
| Supabase: proyecto, buckets privados, Realtime en `messages` y `projects` | Backend |
| Sign in with Whop de punta a punta (development build) | Móvil + Backend |
| Turno básico del agente: mensaje → Claude → respuesta guardada → Realtime | Agente |

**Hito:** inicio sesión con Whop y converso con el agente desde el móvil.

### Fase 2 · Brief y materiales (h 6–14)

| Tarea | Rol |
|-------|-----|
| Prompt del sistema, herramientas `ask_client` y `save_brief`, validación por estado | Agente |
| Subida de archivos con URL firmada; pasar imágenes/PDF a Claude | Backend + Móvil |
| Tarjetas de respuestas rápidas y de **brief** con "Confirmar / Corregir" | Móvil |
| Pruebas de conversación en 3 pares de idiomas (es→en, pt→en, ko→es) | Agente |

**Hito:** la emprendedora de Miami termina con un brief confirmado.

### Fase 3 · Cotización con Terac (h 14–20)

| Tarea | Rol |
|-------|-----|
| Cliente REST de Terac (auth, reintentos con `Retry-After`, zod) | Backend |
| Herramienta `request_quote` + cron `/cron/poll-quotes` | Backend + Agente |
| Mapa de filtros de Terac (`GET /filters`) por idioma/mercado | Backend |
| Cálculo de precio final (costo + comisión) y tarjeta de **cotización** | Agente + Móvil |
| Modo `TERAC_MODE=replay` con respuestas grabadas | Backend |

**Hito:** aparece una cotización real (o grabada de una real) en la app.

### Fase 4 · Pago con Whop (h 20–28)

| Tarea | Rol |
|-------|-----|
| `POST /quote/accept` → checkout de Whop por proyecto | Backend |
| Abrir checkout con `expo-web-browser`, pantalla `checkout/return` | Móvil |
| Webhook `payment.succeeded`: firma, deduplicación, estado `paid` | Backend |
| Probar con tarjetas de prueba del **sandbox** de Whop | Todos |

**Hito:** pago en sandbox → el proyecto pasa a `paid` solo por el webhook.

### Fase 5 · Contratación y entregas en Terac (h 28–38)

| Tarea | Rol |
|-------|-----|
| `create_opportunity` + `launch_opportunity` disparados por el pago | Backend + Agente |
| Alta de webhooks de Terac (script) y `/webhooks/terac` con HMAC | Backend |
| Descargar entregables a Storage; `review_submission` con Opus | Agente |
| Tarjeta de **entrega** y pantalla de revisión (aprobar / pedir cambios) | Móvil |
| `approve` / `reject` en Terac según la decisión del cliente | Backend |
| Línea de tiempo del proyecto y notificaciones push | Móvil |

**Hito:** una entrega (real o de replay) llega, la IA la explica y el cliente la aprueba.

### Fase 6 · Pulido y demo (h 38–48)

- [x] Textos de la interfaz en 3 idiomas; revisar voz de marca.
- [x] Estados vacíos, errores y "el agente está escribiendo…".
- [ ] Ejecutar `pnpm demo:seed --user-id=<uuid>` tras el primer login (script implementado, sin ejecutar aún).
- [ ] Grabar un **video de respaldo** de la demo completa.
- [ ] Diapositivas: problema → solución → demo → modelo de negocio → próximos pasos.
- [ ] Ensayar la demo 3 veces con cronómetro.

## Guion de demo (≈3 min)

1. **Problema** (20 s): "Un buen producto no debería quedarse dentro de un solo idioma."
2. **Login con Whop** y nuevo proyecto (10 s).
3. **Conversación en español** (60 s): la dueña de un negocio en Miami explica su oferta y sube su campaña; el agente pregunta por barrio, público y tono; aparece el brief.
4. **Cotización real de Terac** (20 s): perfil del profesional, plazo y precio.
5. **Pago con Whop** (20 s) → la línea de tiempo pasa a "buscando profesional".
6. **Entrega** (40 s): el agente muestra la campaña adaptada y explica en español qué cambió culturalmente y por qué; recomienda mejorar también la web.
7. **Cierre** (10 s): mostrar el mismo flujo empezando en otro par de idiomas (p. ej. coreano → inglés) para dejar claro que no es solo español/inglés. *"Tu negocio merece ser entendido."*

> En el pitch se omiten detalles técnicos: Terac aporta profesionales reales; la IA contrata y coordina.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| La cotización de Terac la fija una persona y tarda horas | La demo se bloquea | Pedirla el día 0; `TERAC_MODE=replay`; reutilizar `feasibility_request_id` ya respondido |
| No llega una entrega real a tiempo | Falta el final de la demo | Lanzar la oportunidad real temprano (día 1); replay de una entrega real |
| API de Terac en beta (cambios de forma) | Errores en tiempo de ejecución | Validar con zod; aislar en `terac/client.ts`; leer `openapi.json` |
| Dudas sobre metadata/retorno en el checkout de Whop | No se asocia el pago al proyecto | Guardar `variant_id` por proyecto como respaldo; confirmar en sandbox el día 1 |
| OAuth y deep links no funcionan en Expo Go | Login roto | Usar development build desde la fase 1 |
| El agente promete cosas o "dice" que pagó/contrató | Pérdida de confianza | Estados validados en el servidor; tarjetas basadas en datos, no en texto libre |
| Gasto real accidental en Terac | Costo | Tope de presupuesto en el servidor; crear oportunidades solo tras `payment.succeeded` |
| Webhooks no llegan en local | Bloqueo en desarrollo | Desplegar previews en Vercel desde la fase 1 o usar túnel |

## Definición de "terminado" para la demo

- [ ] Login con Whop en un dispositivo real.
- [ ] Conversación completa en al menos 2 idiomas de origen distintos.
- [ ] Brief confirmado → cotización de Terac → pago en sandbox de Whop → oportunidad lanzada.
- [ ] Entrega mostrada con la explicación cultural de la IA y aprobada por el cliente.
- [ ] Ningún secreto en el bundle de la app (`grep` sobre el build).
- [ ] Video de respaldo grabado.

## Después del hackathon

1. Varios profesionales por proyecto (marketing + desarrollador web).
2. Entrada por voz.
3. Suscripción con Whop memberships.
4. Panel interno de operador y métricas (tiempo a cotización, tasa de aprobación, margen).
5. Versión web con checkout embebido de Whop.
