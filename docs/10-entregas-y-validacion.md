# 10 · Entregas, recuperación y validación

Actualizado el 2026-10-24. El código del circuito textual está implementado y cubierto por tests con proveedores simulados. Su validación contra Terac, Whop, Supabase y Anthropic reales sigue pendiente de acceso y credenciales.

## Migración necesaria

Ejecutar `pnpm db:migrate` con `DATABASE_URL` del pooler de Supabase antes de usar las nuevas rutas. La migración `0001_flawless_scarlet_spider.sql` añade contenido/versiones de entregas y leases de webhooks. La inicial fue aplicada en la sesión anterior por MCP y registrada también en el journal de Drizzle; no volver a ejecutar la SQL inicial manualmente.

La migración nueva está en Git, **todavía no aplicada al proyecto remoto**. Su aplicación no necesita borrar tablas, datos ni buckets. El script de migración reaplica también RLS, Realtime y buckets de forma idempotente.

## Circuito del profesional

1. El cliente confirma brief y paga en Whop; solo su webhook firmado habilita contratación.
2. `create_opportunity` genera una tarea `interview` con `review_type=manual_review` y un enlace firmado a `/professional/delivery`. El enlace caduca a los 30 días.
3. Terac añade `teracSubmissionId`/`submissionId`. La API lee esa entrega en Terac y comprueba que su oportunidad pertenece al proyecto del enlace. El token de profesional no funciona como sesión del cliente.
4. El portal muestra brief, criterios, notas y enlaces temporales a los materiales. Recibe textos de 20 a 50.000 caracteres; el MVP no admite todavía PDFs/DOCX/imágenes como entregables del profesional.
5. Cada versión se conserva en el bucket privado `deliverables` como `.txt`, ligada al proyecto y al registro de entrega. La recepción no confirma pago ni aprueba trabajo.
6. El profesional vuelve a Terac y finaliza su tarea. Al sincronizar `awaiting_review`, la API invoca Opus únicamente si tiene el contenido. **Este paso y los parámetros reales de Terac requieren una prueba de integración**; no hay un callback de finalización automática inventado.
7. Se guarda la revisión y se publica la tarjeta `delivery` de forma transaccional. El cliente ve el trabajo, su explicación cultural y su descarga.
8. Si pide cambios, el portal muestra feedback y permite otra versión. No se aprueba ni se rechaza en Terac automáticamente. La nueva versión se revisa y vuelve a `in_review`. El profesional debe volver a abrir el enlace; las notificaciones proactivas están pendientes.
9. Solo el cliente propietario puede aprobar la última versión revisada. Se vuelve a comprobar el estado en Terac y se llama a `approve`. Un trabajo adicional de pago necesita otro brief/cotización y consentimiento del cliente.

Los materiales/entregas son datos para evaluar, nunca instrucciones para la IA. La página escapa HTML, no carga recursos externos, usa `no-store` y evita enviar el token como referer.

## Reintentos y mantenimiento

- Webhooks: `processing_at` + `attempts` reclaman un intento de forma atómica. Fallar libera el intento y conserva el evento sin `processed_at`; un intento abandonado vence tras diez minutos. Solo su propietario puede marcarlo completado.
- Revisión: `content_version`/`reviewed_version` + un lease evitan revisiones simultáneas y tarjetas duplicadas. Un resultado de una versión anterior se descarta. Un fallo deja `review_error` y el cliente puede reintentarlo.
- `POST /v1/projects/:id/submissions/:sid/review`: reintento autorizado al propietario.
- `GET /cron/poll-quotes`: mantiene cotizaciones, recupera webhooks y reintenta revisiones pendientes. En el plan Hobby la programación del repositorio es diaria; para menor latencia sin una app abierta, usar un scheduler externo o Pro.
- `GET /cron/review-submissions`: reintento acotado de revisiones. Las rutas cron exigen `Authorization: Bearer <CRON_SECRET>` y rechazan peticiones si no está configurado.
- Con la pantalla de un proyecto abierta, las cotizaciones se consultan como máximo una vez cada 30 segundos. La app conserva sondeo de respaldo aunque Realtime esté configurado.
- Límite de función configurado: 300 s. La recuperación no es una cola durable ilimitada; trabajos largos necesitan una cola/workflow o lotes más pequeños.

## Demo y comprobaciones

`pnpm demo:seed --user-id=<uuid>` requiere una cuenta que ya haya iniciado sesión con Whop y `TERAC_MODE=replay`. Crea dos proyectos de ejemplo (`in_review`, `delivered`) sin emitir sesiones, llamar a proveedores ni simular un pago confirmado. Es idempotente por usuario y no modifica proyectos existentes. Los textos, el perfil y la evaluación indican que son ilustrativos.

La CI ejecuta comprobación de tipos, tests con mocks, lint y builds API/web. No necesita secretos de terceros. Estas pruebas no sustituyen el recorrido con cuentas reales: login → conversación en tres pares → brief → cotización → pago sandbox → trabajo → entrega → corrección → aprobación.

## Conexiones pendientes de esta sesión

- GitHub: disponible y usado para publicar código.
- Vercel: el conector responde 403 para `xiu17`; su listado de equipos está vacío y CLI no tiene sesión. Hace falta autorizar el mismo equipo/cuenta del proyecto. No se han actualizado variables remotas por este conector.
- Supabase: las herramientas del conector anterior de Claude no están disponibles en esta sesión. Conectar Supabase aquí o proporcionar las variables en los `.env` ignorados permite aplicar la migración.
- Whop/Terac: no hay herramientas conectadas aquí. El MCP del agente y las API keys del backend son accesos distintos. No se ha gastado saldo ni se ha enviado otra solicitud de cotización.
- Cotización de Miami ya enviada: `aofdghee04nvdgbp5gxs2zlq`. La última consulta de la sesión anterior devolvía `RECEIVED`; no afirmar precio ni guardar el ID de demo hasta verificar su respuesta.
