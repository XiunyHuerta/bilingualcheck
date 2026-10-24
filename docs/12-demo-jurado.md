# Demo de evaluación — 24 de octubre de 2026

Enlace para el formulario: https://bilingualcheck-app.vercel.app/

La portada es pública y no abre automáticamente el perfil de una sesión guardada. La cuenta y sus proyectos se encuentran en `/dashboard`. No se cargan negocios o proyectos de ejemplo al entrar.

## Recorrido de seis pasos

1. Abre la portada e inicia la demo con tu cuenta de Whop. La interfaz detecta el idioma del dispositivo; el menú permite elegir otro o volver a la detección automática.
2. Crea un objetivo y conversa con la IA. Indica negocio, público, mercado, idiomas y entregables. El agente hace preguntas cuando falta información y prepara el brief.
3. Edita y confirma el brief. La cotización simulada tarda aproximadamente 30 segundos mientras la página permanece abierta.
4. Revisa el precio y selecciona **Pago demo de Whop · Simular pago** para evaluar sin tarjeta ni cargos. **Pagar con Whop** abre un checkout separado; no es necesario completar un pago real para evaluar la demo.
5. Examina las tareas y el profesional ficticio del proyecto. Puedes enviar una pregunta o proponer una cita, llamada o videollamada. La acción explícita de respuesta demo permite comprobar respuestas, confirmaciones y avisos. No crea una sala de videollamada real.
6. Selecciona **Simular entrega del profesional** en el chat. La IA genera un ejemplo basado en el brief y revisa sus criterios. Abre la entrega, solicita cambios si quieres, simula la versión corregida y aprueba para finalizar.

Un servicio diferente del ya aprobado requiere otro proyecto y otra cotización. Las aclaraciones del mismo encargo pueden seguir en su conversación.

## Validación realizada

- Navegador de producción: creación, mensaje con Enter, respuesta real del agente, edición y confirmación del brief y cotización por 105 USD para el caso temporal de prueba.
- Apertura del checkout de Whop con el importe esperado, sin introducir tarjeta ni pagar.
- Pago demo y asignación ficticia; pregunta al profesional, solicitud y confirmación simulada de videollamada.
- Entrega de ejemplo revisada por IA; feedback traducido, segunda versión revisada y aprobación final comprobada en el navegador y la base de datos.
- La API rechaza acceso sin sesión (401) y operaciones de otro propietario (404).
- 177 pruebas de API, 12 pruebas compartidas y 10 de configuración; comprobación de tipos, lint y compilación web.

## Límites de la demostración

Gemini y Whop dependen de sus servicios y cuotas. El modelo anterior agotó su cuota gratuita durante la prueba; el agente y las revisiones se cambiaron a `gemini-3.5-flash-lite` y se comprobó una respuesta real. La traducción de interfaz usa `gemini-3.1-flash-lite`, separada del trabajo del agente.

Terac funciona en `replay`: perfiles, precios y trabajo de esta evaluación son simulados y se etiquetan. No se ha verificado una contratación real ni realizado un cobro real. Los adjuntos y las fotos que requieren la clave de Storage quedan fuera de esta demo y sus controles se ocultan cuando no están configurados. La entrega de ejemplo puede leerse en la aplicación sin Storage.

El circuito de reuniones se verificó con datos desechables, incluida protección frente a conflictos de horario y versiones antiguas. La limpieza de las cuentas temporales se realizó mediante la conexión administrativa; el rol del backend conserva sus permisos limitados.
