# 01 · Visión de producto y alcance del MVP

## Problema

Muchos negocios tienen buenos productos pero no llegan a clientes de otra comunidad lingüística porque:

- Una **traducción literal** pierde la intención comercial o suena poco natural.
- No conocen la **cultura, la jerga ni la ciudad** del público objetivo.
- Es difícil **encontrar, contratar y supervisar** a un profesional cuando hay una barrera de idioma de por medio.

## Propuesta de valor

Un agente que:

1. **Escucha** al cliente en su idioma y detecta objetivo, mercado y audiencia.
2. **Contextualiza**: ciudad, jerga, sector y diferencias culturales.
3. **Contrata** por Terac al perfil adecuado (marketing, adaptación cultural, diseño, desarrollo web).
4. **Coordina**: reparte tareas, recoge opiniones reales, gestiona correcciones y entrega dentro del alcance acordado.

## Usuarios

| Persona | Descripción | Lo que necesita |
|---------|-------------|-----------------|
| **Dueña/o de negocio** (usuario principal) | Pequeño negocio, domina un idioma (p. ej. español en Miami, coreano en Los Ángeles, portugués en Toronto). Poca experiencia contratando freelancers. | Explicar su meta en su idioma, saber cuánto cuesta, recibir algo usable y entender qué se hizo. |
| **Profesional de Terac** (usuario indirecto) | Experto verificado de Terac. No usa nuestra app; trabaja desde Terac. | Un brief claro, materiales y criterios de aceptación. |
| **Operador de BilingualCheck** (interno) | El equipo. | Ver proyectos, costos, fallos del agente y poder intervenir. |

## Caso de uso de referencia (demo)

> Una emprendedora de Miami solo habla español y quiere atraer clientes angloparlantes. Sube su campaña, explica su oferta y responde preguntas sobre la zona y el público. El agente busca en Terac a un profesional de marketing familiarizado con ese mercado; si la web también necesita mejoras, puede recomendar a un desarrollador. Revisa el trabajo y coordina la entrega.

## Historias de usuario

### MVP (hackathon)

| ID | Como… | Quiero… | Para… |
|----|-------|---------|-------|
| US-01 | dueña de negocio | iniciar sesión con Whop | no crear otra cuenta |
| US-02 | dueña de negocio | hablar con el agente en mi idioma (texto) | explicar lo que necesito sin barreras |
| US-03 | dueña de negocio | subir mi campaña (imágenes, PDF, enlace web) | que el agente y el profesional la vean |
| US-04 | dueña de negocio | ver un **brief** resumido en mi idioma y confirmarlo | asegurarme de que me entendieron |
| US-05 | dueña de negocio | ver una **cotización** clara (precio, plazo, qué incluye) | decidir si contrato |
| US-06 | dueña de negocio | pagar con Whop | arrancar el trabajo |
| US-07 | dueña de negocio | seguir el estado del proyecto en una línea de tiempo | saber qué está pasando sin preguntar |
| US-08 | dueña de negocio | recibir el entregable con una explicación en mi idioma de los cambios culturales | entender y confiar en el resultado |
| US-09 | dueña de negocio | aprobar o pedir una corrección | cerrar el proyecto o mejorarlo |

### Después del hackathon

- Entrada por **voz** en cualquier idioma.
- Proyectos con **varios profesionales** en paralelo (marketing + desarrollador web).
- **Panel de recomendaciones** ("tu web también necesita ajustes").
- **Suscripción** mensual (Whop memberships) para negocios con campañas recurrentes.
- Panel interno de operador.

## Alcance del MVP

**Entra**
- Login con Whop, chat con el agente, subida de archivos, brief, cotización real de Terac, pago con Whop (sandbox), lanzamiento de la oportunidad en Terac, recepción de entregas por webhook, revisión por la IA, aprobación del cliente.
- Un tipo de trabajo bien resuelto: **adaptación cultural de una campaña de marketing** (textos + recomendaciones).
- Cualquier par de idiomas a nivel de datos; la demo usa español → inglés (Miami).

**No entra**
- Varios profesionales por proyecto, voz, suscripciones, panel interno, disputas complejas.

## Métricas de éxito (demo)

- Del primer mensaje a la cotización en **menos de 5 minutos**.
- **0 acciones con dinero** que no pasen por un pago confirmado en el servidor.
- El brief que genera el agente es aceptado por el cliente **sin editarlo** en la demo.

## Modelo de negocio (propuesta)

- Precio al cliente = **costo Terac (cotización) + comisión BilingualCheck** (p. ej. 20–30 %), cobrado por adelantado con Whop.
- Terac cobra a la organización de BilingualCheck **solo por entregas aprobadas** ("pay on completion"). Lo que no se apruebe no se factura; esa diferencia se reembolsa al cliente o se usa para una corrección.
- Más adelante: plan mensual con Whop memberships.
