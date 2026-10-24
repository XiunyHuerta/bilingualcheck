# BilingualCheck · Documentos de planificación

> *Tu negocio merece ser entendido. · Your business deserves to be understood.*

BilingualCheck es un agente de IA para negocios que dominan un idioma y quieren llegar a una comunidad que habla otro. El agente entiende la meta del negocio, contrata profesionales reales a través de **Terac** y coordina el trabajo (campañas, webs, materiales) hasta la entrega. El cliente paga con **Whop**. La app móvil se construye con **React Native + Expo**.

## Índice

| # | Documento | Para qué sirve |
|---|-----------|----------------|
| 01 | [Visión de producto y alcance del MVP](01-producto-y-mvp.md) | Problema, usuarios, historias de usuario, qué entra y qué no en el hackathon |
| 02 | [Arquitectura del sistema](02-arquitectura.md) | Componentes, stack, diagramas, flujo extremo a extremo, máquina de estados |
| 03 | [Agente de IA](03-agente-ia.md) | Cómo piensa y actúa el agente, herramientas, prompts, guardarraíles |
| 04 | [Integración con Terac](04-integracion-terac.md) | Cotizar, contratar, recibir entregas y webhooks de Terac |
| 05 | [Integración con Whop](05-integracion-whop.md) | Sign in with Whop, checkout, webhooks de pago, reembolsos |
| 06 | [App móvil Expo](06-app-expo.md) | Pantallas, navegación, estado, librerías, i18n, sistema de diseño |
| 07 | [Modelo de datos y API](07-datos-y-api.md) | Tablas, endpoints propios, contratos |
| 08 | [Plan de trabajo del hackathon](08-plan-hackathon.md) | Fases, tareas, reparto, guion de la demo, riesgos |
| 09 | [Despliegue en Vercel y variables](09-despliegue-y-variables.md) | Proyectos de Vercel, variables que faltan (quién las pone) y configuración de Whop sandbox |
| 10 | [Entregas y validación](10-entregas-y-validacion.md) | Portal del profesional, migración, revisión, correcciones, recuperación y bloqueos reales |

## Decisiones clave (resumen)

1. **Expo (Expo Router + TypeScript)** para iOS/Android/Web desde una sola base de código.
2. **Backend propio obligatorio** (Hono en Vercel): las claves de Terac y Whop nunca viajan al móvil, y los webhooks necesitan una URL pública.
3. **Terac por REST v2** (`https://terac.com/api/external/v2`) con API key de organización. El servidor MCP de Terac queda como alternativa para prototipar el agente.
4. **Whop** para dos cosas: **identidad** (Sign in with Whop, OAuth 2.1 + PKCE) y **cobro** (checkout alojado + webhook `payment.succeeded`).
5. **Claude** como cerebro del agente, con uso de herramientas (tool use). El dinero solo se mueve cuando el servidor lo permite, nunca solo porque el modelo lo decida.
6. **Supabase** (Postgres + Storage + Realtime) para datos, archivos del cliente y actualizaciones en vivo en la app.

## Principios de producto (del brief original)

- El problema central siempre es: *un negocio domina un idioma y necesita llegar a una comunidad que habla otro*. La cultura local importa.
- **No** es un traductor ni un directorio de freelancers: la IA gestiona; las personas de Terac aportan criterio cultural y ejecutan.
- Funciona entre **cualquier par de idiomas**. Nada en el código ni en la UI debe asumir inglés ↔ español.
- Voz de marca: clara, inclusiva, cercana, orientada a resultados. Sin estereotipos ni promesas de ventas garantizadas.
