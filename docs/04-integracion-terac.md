# 04 · Integración con Terac

Terac es un marketplace de trabajo experto pensado para que agentes de IA contraten personas verificadas. Se paga **por entrega completada**: lo que no pasa revisión no se factura.

> ⚠️ La API v2 de Terac está en **beta**: rutas y formas pueden cambiar. Antes de codificar, revisar el OpenAPI en `https://terac.com/docs/developers/openapi.json`. Los puntos marcados con **[verificar]** no los confirmamos en la documentación pública.

## Conexión

| Dato | Valor |
|------|-------|
| Base URL | `https://terac.com/api/external/v2` |
| Autenticación | `Authorization: Bearer <TERAC_API_KEY>` (clave de organización, solo en el backend) |
| Límite de uso | 100 peticiones seguidas por clave; luego `429 RATE_LIMITED` con `Retry-After` hasta que pasen > 60 s sin peticiones aceptadas |
| Errores | `code`, `message`, `issues` (los de API key, anidados en `error`) |
| `409` | La operación no es válida en el estado actual de la oportunidad |

Cliente sugerido en `apps/api/src/terac/client.ts`: `fetch` + zod para validar respuestas + reintento respetando `Retry-After`.

## Mapeo de nuestro flujo a Terac

| Paso BilingualCheck | Llamada Terac | Notas |
|---------------------|---------------|-------|
| Pedir cotización | `POST /feasibility/requests` | Enviamos un brief en lenguaje natural: rol, tarea, número de profesionales, mercado. Cuerpo exacto **[verificar]**. |
| Esperar precio | `GET /feasibility/requests/{requestId}` | Sondeo por cron hasta estado `RESPONDED` (el MCP lo llama `PRICED` y devuelve `cpi_usd`). **El precio lo pone una persona de Terac: puede tardar.** |
| Crear trabajo (tras el pago) | `POST /projects` (una vez por organización/entorno) y `POST /opportunities` | Se crea en `draft`; no cobra hasta lanzar. |
| Lanzar | `POST /opportunities/{id}/launch` | Opcional `{ "without_screener": true }`. |
| Ver candidatos | `GET /opportunities/{id}/applicants` | Si usamos `customer_screening_review: "manual_review"`. |
| Invitar / descartar candidato | `POST /submissions/{id}/invite` · `/decline` | |
| Ver entregas | `GET /opportunities/{id}/submissions?status=` · `GET /submissions/{id}` | |
| Aceptar entrega | `POST /submissions/{id}/approve` | Dispara el cobro de Terac. |
| Rechazar entrega | `POST /submissions/{id}/reject` | No se factura. |
| Pausar / reanudar / parar | `POST /opportunities/{id}/pause` · `/resume` · `/stop` | `stop` acepta `reason`. |

## Crear la oportunidad desde el brief

Campos obligatorios de `POST /opportunities`: `title`, `project_id`, `num_participants`, `business_type`, `tasks[]` y `filters[]` **o** `unrestricted_audience: true`.

```json
{
  "project_id": "<TERAC_PROJECT_ID>",
  "title": "Adaptación cultural de campaña: español → inglés (Miami)",
  "internal_title": "bc_proj_8f2a",
  "description": "Negocio: clínica dental familiar en Little Havana...\nObjetivo: atraer clientes angloparlantes...\nPúblico: ...\nCriterios de aceptación: ...",
  "num_participants": 1,
  "business_type": "b2b",
  "customer_screening_review": "auto_invite",
  "expected_days_to_complete": 5,
  "feasibility_request_id": "<id de la cotización>",
  "filters": [ "<idioma, ubicación, experiencia en marketing: ver GET /filters>" ],
  "screening_questions": [
    { "question": "¿Has creado campañas para el público anglohablante de Miami? Describe un ejemplo." }
  ],
  "tasks": [
    {
      "sequence": 1,
      "task_type": "file_upload",
      "review_type": "manual_review",
      "instructions": "Descarga los materiales en <URL firmada>. Entrega: 1) textos adaptados de los 3 anuncios, 2) notas culturales que expliquen cada cambio, 3) recomendaciones para la web.",
      "accepted_mime_types": ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    }
  ]
}
```

Notas:
- **El pago al profesional no es un campo**: lo fija la cotización (`feasibility_request_id`).
- `expected_days_to_complete` mínimo 5 (por defecto 7).
- Los **filtros** (idioma, país, estado, experiencia) se descubren con `GET /filters` y las opciones de cada filtro. Construir un mapa `target_language/target_market → filters[]` al inicio del hackathon.
- Los materiales del cliente se comparten con **URLs firmadas de Supabase** con caducidad larga (p. ej. 7 días) dentro de `instructions` **[verificar si Terac permite adjuntar archivos en la tarea]**.

## Estados

**Oportunidad**: `draft` → `pre_recruiting` → `active` → `fulfilled` → `completed`; también `paused`, `stopped`, `expired`, `cancelled`, `failed`. Si queda en `failed`, se crea una nueva en vez de reintentar. Tratar cualquier estado desconocido como "no acepta llamadas".

**Entrega (submission)**: `screen_passed`, `screened_out`, `in_progress`, `awaiting_review`, `approved`, `rejected`, `abandoned`.

| Estado Terac | Estado BilingualCheck |
|--------------|------------------------|
| oportunidad `active` sin entregas | `recruiting` |
| entrega `in_progress` | `in_progress` |
| entrega `awaiting_review` | `in_review` (el agente revisa) |
| entrega `approved` | `delivered` |
| entrega `abandoned` / oportunidad `expired` | volver a `recruiting` o `refunded` |

## Webhooks

Alta (una vez por entorno, con script `pnpm terac:webhooks`):

1. `POST /hooks/subscriptions` con `target_url = https://<api>/webhooks/terac` y `event_types = ["submission.status.change", "submission.approved"]`.
2. Terac envía `webhook.ping`; confirmar con `POST /hooks/subscriptions/{id}` y cuerpo `{}`.
3. Leer el secreto con `GET /hooks/subscriptions/{id}/secret` → `TERAC_WEBHOOK_SECRET`.

Verificación en `/webhooks/terac`:

```ts
const ts = req.header("X-Terac-Request-Timestamp")!;
const sig = req.header("X-Terac-Request-Signature")!;
const raw = await req.text();                      // cuerpo crudo, sin parsear
if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return c.text("stale", 400);
const expected = createHmac("sha256", TERAC_WEBHOOK_SECRET).update(ts + raw).digest("base64");
if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return c.text("bad sig", 401);
// deduplicar por X-Event-ID en webhook_events, responder 200 rápido, procesar después
```

Reintentos de Terac: 12, con backoff exponencial, en `5xx`, `408` y `429`; timeout de 10 s; no sigue redirecciones. **Responder 2xx en < 10 s** y procesar en segundo plano.

No hay webhook documentado para cotizaciones, por eso usamos **cron** para `GET /feasibility/requests/{id}`.

## Correcciones (revisiones)

Terac no documenta públicamente un ciclo de "pedir cambios" sobre la misma entrega **[verificar]**. Propuesta para el MVP:

1. Si el cliente pide cambios y la entrega **no cumple** el brief → `reject` (no se factura) y nueva oportunidad con el feedback.
2. Si la entrega **cumple** pero el cliente quiere ajustes menores → `approve` y crear una oportunidad corta de "ronda de ajustes" (requiere nuevo pago o un margen ya incluido en el precio).

Incluir **una ronda de ajustes** en el precio inicial simplifica la experiencia.

## Modo demo

El precio lo fija una persona de Terac y puede tardar horas. Para la demo:

- Crear **antes** una cotización real ya respondida y reutilizar su `feasibility_request_id`.
- Variable `TERAC_MODE=live|replay`: en `replay`, el cliente de Terac devuelve respuestas grabadas de una ejecución real (mismo formato), para que la demo no dependa de tiempos externos.
