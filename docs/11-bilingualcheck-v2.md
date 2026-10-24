# BilingualCheck V2

La actualización conserva Expo Router, React Native Web, Hono, Gemini mediante AI SDK, Postgres/Drizzle, Supabase, Whop y Terac. No sustituye autenticación ni proveedores.

## Pantallas y código

- `apps/mobile/src/app/(tabs)/dashboard.tsx`: dashboard en `/dashboard`, con estadísticas del estado persistente, último mensaje del agente por proyecto y actividad registrada. `/` muestra siempre la portada pública.
- `apps/mobile/src/app/(tabs)/projects.tsx`: proyectos en lista vertical, búsqueda, filtro de activos y contexto del encargo.
- `apps/mobile/src/app/new.tsx`: objetivo en texto libre, sugerencias, idioma de conversación y destino opcional. Se envía como primer mensaje del proyecto para que el agente prepare el brief/plan existente.
- `apps/mobile/src/app/project/[id]/workspace.tsx`: resumen, plan, tareas, equipo, entregables y registro de actividad. Conserva el chat, editor de brief, cotización, pago y centro de revisión originales.
- `apps/mobile/src/components/task-board.tsx`: responsables recibidos de Terac, estados, fechas, dependencias y comentarios; actualizaciones con control de versión.
- `apps/mobile/src/app/(tabs)/agent.tsx`, `professionals.tsx` y `apps/mobile/src/app/settings.tsx`: agente con contexto por proyecto, equipo y ajustes de idioma/sesión. Los ajustes son accesibles mediante un engranaje desde el perfil y la bienvenida, también sin sesión.
- `apps/mobile/src/components/desktop-header.tsx`: navegación lateral de escritorio; tabs adaptados en móvil.
- `apps/mobile/src/components/business-profile.tsx`: perfil simplificado con datos básicos, logo y fotos. Se retiraron idiomas y comunidades, productos y servicios, conocimiento de marca y memoria de IA. El agente recoge esos detalles en la conversación de cada proyecto.
- `apps/mobile/src/app/(tabs)/notifications.tsx`: aprobaciones, bloqueos, fechas de tareas, actividad y mensajes/reuniones del sistema existente.
- `apps/mobile/src/locales/v2.ts` y `refinements.ts`: textos en español, inglés y portugués. Se mantiene separado el idioma del proyecto y el de la interfaz. El idioma se elige al iniciar el perfil y se cambia en ajustes; se guarda en web, SecureStore nativo y la cuenta autenticada.
- `apps/mobile/src/app/demo.tsx`: entrada al flujo del proyecto desde cero. Abre la creación de proyecto con sesión o el acceso con Whop sin sesión; se retiró el recorrido precargado de Sol y Azúcar. El chat conserva las seis etapas: conversación, brief, cotización, pago, trabajo y entrega.

## Persistencia y autorización

`packages/shared/src/workspace.ts` define estados y entradas validadas. `apps/api/src/services/workspace.ts` y `routes/workspace.ts` exponen los resúmenes de proyectos y tareas con comprobación de propietario.

La migración `apps/api/drizzle/0004_workspace_v2.sql` añade `project_tasks` y `project_activity`, índices, restricciones y registro transaccional de cambios de proyecto y entregas mediante triggers. Las tablas tienen RLS; los clientes anónimos y autenticados no acceden directamente. El backend utiliza su rol existente y verifica el propietario en cada ruta. Las tareas nacen de entregables del brief aprobado y el porcentaje se calcula como tareas completadas / total; no se inventan porcentajes.

Los cambios de tareas no completan automáticamente un proyecto ni aprueban una entrega. Se conserva la aprobación del cliente y la confirmación de pagos del servidor. La información original del negocio solo cambia mediante la edición explícita del propietario. El agente lee el contexto guardado como datos y no tiene herramientas para modificarlo.

Tras confirmar el alcance, la conversación continúa admitiendo preguntas, archivos y aclaraciones del mismo encargo, pero el brief no se reescribe. La API bloquea cambios de alcance una vez confirmado o cotizado, incluidos pagos demo. Para otro servicio, el agente ofrece `suggest_new_project`: una tarjeta abre un formulario con la nueva necesidad para que el cliente decida crear el proyecto. No crea, cotiza, cobra ni contrata automáticamente.

Las fichas del equipo muestran nombre, especialidad cuando Terac proporciona una experiencia con rol y experiencia compartida, sin inventar credenciales. Incluyen acciones para preguntar y concertar una cita o llamada; el portal del profesional puede proponer y confirmar reuniones, compartir enlaces de vídeo y dejar actualizaciones que aparecen en las notificaciones del cliente.

La migración `0003_business_profile.sql`, que ya existía en el checkout, es necesaria antes de V2. En producción ambas migraciones se registran también en el historial Drizzle para conservar su compatibilidad con el proceso existente.

## Integraciones y límites

- El análisis y el plan usan el agente Gemini configurado y el editor de brief existente; requieren las credenciales del agente.
- Whop mantiene el acceso y el checkout. Crear objetivos o aprobar planes no cobra.
- Terac conserva la cotización, oportunidad, asignación y entregas existentes. Los criterios consideran competencia, idiomas y experiencia de mercado. La interfaz indica que la API actual no proporciona un catálogo independiente de candidatos seleccionables. No se inventan profesionales, credenciales ni disponibilidad.
- El modo replay y los pagos demo existentes se etiquetan. El botón «Pago demo de Whop · Simular pago» continúa el proyecto sin cobrar; el checkout de Whop permanece disponible por separado. La entrada Demo utiliza el flujo autenticado existente y no siembra ejemplos.
- No se añaden analítica avanzada, multiempresa, campañas automáticas ni nuevos proveedores de seguimiento: quedan como ampliaciones futuras.
- La revisión permite pedir una traducción del feedback al idioma objetivo mediante Gemini. El historial conserva el original y la traducción juntos. Traducir no envía mensajes al profesional ni aprueba una entrega; la decisión original se conserva por separado. Las versiones anteriores se consultan mediante los archivos privados que ya guarda el sistema de entregas.

## Desarrollo y compilación

Desde la raíz: `pnpm install`, `pnpm dev:api`, `pnpm dev:mobile`. Mantener las variables existentes de `apps/api/.env` y `apps/mobile/.env` sin subirlas al repositorio.

Comprobaciones de código: `pnpm -r typecheck`, `pnpm --filter @bc/mobile lint`, `pnpm --filter @bc/api build`, `pnpm --filter @bc/mobile exec expo export --platform web`.

Los despliegues conservan los proyectos existentes `bilingualcheck-api` (raíz `apps/api`) y `bilingualcheck-app` (raíz `apps/mobile`). No se cambian sus variables ni la integración Git. La validación funcional de usuario queda pendiente por petición del propietario.

## Menú y presentación del equipo

`components/account-menu.tsx` muestra un engranaje de ajustes, con un desplegable de idiomas, avisos y sesión. Los enlaces antiguos a `/settings` redirigen al menú. Se retiraron los textos de notificaciones de la cabecera y la barra lateral.

`language-picker.tsx` ofrece un catálogo de 185 idiomas, búsqueda por nombre nativo, nombre localizado o código y entrada de otros códigos BCP-47 reconocidos. Español, inglés y portugués siguen incluidos sin conexión; los demás cargan textos de interfaz mediante Gemini desde `routes/localization.ts`, con validación de interpolaciones, lotes, caché y límites de solicitudes. El idioma solo cambia cuando el paquete está completo. No se envían datos de usuarios o proyectos a este servicio. Las traducciones adicionales requieren la clave de Gemini ya configurada.

En «Equipo» ya no se inserta el perfil ficticio automáticamente. Sin proyectos se muestra un estado vacío con la acción para comenzar. Las fichas recibidas de Terac se agrupan por proyecto, muestran el estado de asignación y conservan la comunicación autenticada existente.

## Reinicio para el jurado

El 24 de octubre se eliminaron los cinco proyectos de prueba identificados, con sus mensajes, cotizaciones, pagos internos simulados o pendientes, tareas y actividad. Se vació el negocio de prueba y se conservaron las cuentas de acceso, idiomas e integraciones. No se insertan proyectos de ejemplo al iniciar.

El compositor envía con Enter en web y mantiene Shift+Enter para saltos de línea. Evita duplicar envíos mientras espera respuesta, conserva texto y adjuntos si falla y muestra un error recuperable. Los archivos se capturan junto con el mensaje antes de limpiar el borrador. La conversación puede continuar mientras responde el agente, dentro del mismo alcance.

El idioma inicial sigue el dispositivo, incluidos idiomas adicionales con traducción de interfaz. Una selección manual se guarda por separado; el menú permite volver al idioma del dispositivo. No se confunde esa preferencia con los idiomas de los materiales de cada proyecto.

El pago simulado registra una asignación de replay y permite generar una entrega de ejemplo desde el brief del usuario, pedir correcciones y aprobar. El profesional ficticio dispone de una acción explícita para simular respuestas o confirmaciones de citas y verificar los avisos. No se crean salas de llamada ni contrataciones reales.
