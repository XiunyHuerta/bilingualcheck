# 07 · Modelo de datos y API

## Diagrama entidad-relación

```mermaid
erDiagram
    users ||--o{ projects : tiene
    projects ||--o{ messages : contiene
    projects ||--o{ assets : contiene
    projects ||--o{ quotes : recibe
    projects ||--o{ payments : paga
    projects ||--o{ terac_opportunities : lanza
    terac_opportunities ||--o{ submissions : recibe
    projects ||--o{ agent_runs : registra

    users {
        uuid id PK
        text whop_user_id UK
        text email
        text name
        text ui_language
        text business_name
        timestamptz created_at
    }
    projects {
        uuid id PK
        uuid user_id FK
        text status
        text source_language
        text target_language
        jsonb target_market
        jsonb brief
        bool brief_confirmed
        bool agent_busy
        timestamptz created_at
    }
    messages {
        uuid id PK
        uuid project_id FK
        text role "user | assistant | system_event"
        text content
        jsonb card "brief | quote | delivery | quick_replies"
        text language
        timestamptz created_at
    }
    assets {
        uuid id PK
        uuid project_id FK
        text kind "client_upload | deliverable"
        text storage_path
        text mime_type
        text source_url
    }
    quotes {
        uuid id PK
        uuid project_id FK
        text terac_feasibility_request_id
        text status
        numeric terac_cost_usd
        numeric fee_usd
        numeric total_usd
        int eta_days
    }
    payments {
        uuid id PK
        uuid project_id FK
        uuid quote_id FK
        text whop_variant_id
        text whop_payment_id
        text status "pending | succeeded | failed | refunded"
        numeric amount_usd
    }
    terac_opportunities {
        uuid id PK
        uuid project_id FK
        text terac_opportunity_id UK
        text status
    }
    submissions {
        uuid id PK
        uuid opportunity_id FK
        text terac_submission_id UK
        text status
        jsonb participant_summary
        jsonb ai_review
        text client_decision "approved | changes_requested"
        text client_feedback
    }
    agent_runs {
        uuid id PK
        uuid project_id FK
        text trigger
        text model
        jsonb tool_calls
        int input_tokens
        int output_tokens
        text error
    }
    webhook_events {
        text provider PK
        text event_id PK
        jsonb payload
        timestamptz processed_at
    }
```

Notas:
- `participant_summary` guarda solo nombre y experiencia resumida; **no** email ni LinkedIn del profesional.
- `webhook_events` con PK compuesta `(provider, event_id)` garantiza idempotencia.
- RLS de Supabase: `projects.user_id = auth.uid()` (emitir JWT compatible con Supabase o usar un canal Realtime por proyecto autorizado por el backend).

## API propia (`/v1`)

Todas las rutas (salvo auth y webhooks) requieren `Authorization: Bearer <session_jwt>`.

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/v1/auth/whop` | `{ code, code_verifier, redirect_uri }` → `{ session_jwt, user }` |
| `GET` | `/v1/me` | Usuario actual |
| `PATCH` | `/v1/me` | `ui_language`, `business_name` |
| `POST` | `/v1/auth/logout` | Revoca el refresh token de Whop |

### Proyectos y chat

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/v1/projects` | Lista con estado y último mensaje |
| `POST` | `/v1/projects` | Crea proyecto en `intake`; el agente envía el saludo |
| `GET` | `/v1/projects/:id` | Proyecto + brief + cotización + entregas |
| `GET` | `/v1/projects/:id/messages?before=` | Historial paginado |
| `POST` | `/v1/projects/:id/messages` | `{ content, asset_ids? }` → `202`; respuesta del agente por Realtime |
| `POST` | `/v1/projects/:id/brief/confirm` | Confirma el brief → el agente pide cotización |

### Archivos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/v1/projects/:id/assets` | `{ filename, mime_type }` → `{ asset_id, upload_url }` |
| `POST` | `/v1/projects/:id/assets/:assetId/complete` | Marca la subida como terminada |
| `GET` | `/v1/projects/:id/assets/:assetId/url` | URL firmada de descarga |

### Cotización y pago

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/v1/projects/:id/quote/accept` | Crea el checkout de Whop → `{ purchase_url }`; estado `awaiting_payment` |
| `GET` | `/v1/projects/:id/payment` | Estado del pago (respaldo si Realtime falla) |

### Entregas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/v1/projects/:id/submissions` | Entregas con revisión de la IA |
| `POST` | `/v1/projects/:id/submissions/:sid/decision` | `{ decision: "approve" \| "request_changes", feedback? }` |

### Webhooks y tareas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/webhooks/whop` | Pagos (firma verificada) |
| `POST` | `/webhooks/terac` | Entregas (HMAC `X-Terac-Request-Signature`) |
| `GET` | `/cron/poll-quotes` | Vercel Cron, protegido con `CRON_SECRET` |

## Formato de errores

```json
{ "error": { "code": "INVALID_STATE", "message": "El proyecto debe estar en 'quoted' para aceptar la cotización.", "details": { "status": "intake" } } }
```

Códigos: `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_STATE`, `VALIDATION_ERROR`, `UPSTREAM_TERAC`, `UPSTREAM_WHOP`, `RATE_LIMITED`.

## Paquete compartido (`packages/shared`)

- `ProjectStatus` y la tabla de transiciones válidas (la usan backend y app).
- Esquemas zod: `Brief`, `Quote`, `SubmissionReview`, cuerpos de cada endpoint.
- Utilidades de idioma: validar BCP-47, nombre del idioma con `Intl.DisplayNames`.
