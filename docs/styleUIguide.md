# BilingualCheck · Guía breve de estilo UI

> *Your business deserves to be understood.* Interfaz cálida, clara y humana: la IA organiza, las personas aportan criterio.
> Fuente: brand board, mock-up de aplicaciones y el sistema visual del video demo (`video/src/index.html`).

## 0. Assets (`public/brand/`)

| Archivo | Uso |
|---|---|
| `bilingualcheck-logo-horizontal.png` | Logo principal sin tagline: headers y barra superior (fondo transparente) |
| `bilingualcheck-logo-full.png` | Logo con tagline: portadas, cierres, diapositivas |
| `bilingualcheck-mark.png` | Símbolo solo: favicon, avatar del agente, ícono de app |
| `hands-puzzle.png` | Imagen de manos y piezas: héroes, aperturas, estados vacíos |
| `brand-board.png` · `brand-applications.png` | Referencia del brand kit (no usar como UI) |

Deja espacio libre alrededor del logo equivalente a la altura de una pieza del símbolo, y no lo coloques sobre fondos `sky` ni `gold`.

## 1. Color

| Token | Hex | Uso |
|---|---|---|
| `cobalt` | `#315A9E` | Primario: botones, paso activo, mensajes del dueño, palabras clave en títulos |
| `sky` | `#A6CBEA` | Agente e IA: burbujas del agente, brief, conectores |
| `gold` | `#F5C949` | Acentos y resaltados (marcador), badge "Concept demo" |
| `cream` | `#F5F0D7` | Fondo general de la app y de las escenas |
| `coral` | `#D98178` | Lo humano: profesionales, alertas suaves, "antes" / revisión pedida |
| `sage` | `#548569` | Éxito: completado, aprobado, entregado |
| `ink` | `#202835` | Texto principal y superficies oscuras (nodo Terac, CTA del póster) |

**Superficies:** papel `#FFFDF7` (ventana), blanco `#FFFFFF` (tarjetas), barra lateral `#FBF8EC`.
**Tintes suaves** (fondos de chips y estados): sky `#E7F0F9` · gold `#FCF1CC` · coral `#F7E2DE` · sage `#E2EDE6`.
**Texto secundario:** `ink` al 62 %. **Bordes:** `ink` al 12 %.

Reglas:
- Sobre `sky`, `gold` y `cream` el texto va en `ink` o `cobalt`, **nunca en blanco** (contraste AA).
- Los estados siempre combinan tinte suave y texto oscuro del mismo color (p. ej. fondo sage-soft con texto sage).
- Un color por significado: coral = humano / revisión, sage = hecho, sky = agente. No mezclar.

`ink` está unificado en `#202835` en los tokens de la app y en el doc 06.

## 2. Tipografía

| Rol | Fuente | Peso | Tamaño (web, 1920 px) |
|---|---|---|---|
| Display / H1 | Manrope | 800, tracking −1 px | 46–76 px |
| H2 / títulos de tarjeta | Manrope | 800 | 21–26 px |
| Cuerpo | DM Sans (o Inter) | 400–600 | 16–23 px |
| Eyebrow / labels | DM Sans | 700, MAYÚSCULAS, tracking 1.5–3 px | 12–15 px |
| Glosa / traducción | DM Sans | 400 itálica, texto secundario | 14–16 px |

- Los títulos son frases cortas, y una palabra clave puede ir en `cobalt` ("limited by **language**").
- En móvil, escalar aproximadamente ×0.6 (H1 28–32, cuerpo 15–17).

## 3. Forma, espacio y profundidad

- **Radios:** ventana 30 · tarjetas 22 · filas o campos 14 · botones 14 · chips 12 · pills 999.
- **Sombras:** suaves y difusas. Tarjeta `0 8px 24px ink/6 %`, ventana `0 40px 100px ink/18 %`.
- **Espaciado:** base de 4. Separación entre tarjetas 20–28; padding interno 18–26.
- **Fondo:** `cream` con *blobs* grandes y desenfocados de la paleta (gold, sky, sage, coral; 35–60 % de opacidad) en las esquinas.
- **Motivo:** piezas de rompecabezas con forma de burbuja de diálogo y manos reales que las unen. **Sin banderas ni globos terráqueos.**

## 4. Componentes clave

- **Botón primario:** fondo `cobalt`, texto blanco Manrope 700, radio 14. Su estado de éxito pasa a `sage` con "✓".
- **Stepper de 6 pasos:** el paso activo es una pastilla `cobalt` con número blanco; los completados llevan un círculo `sage` con ✓; los pendientes, un círculo con borde gris.
- **Burbujas de chat:** dueño a la derecha en `cobalt`; agente a la izquierda en sky-soft. Si el idioma no es el de la audiencia, la glosa traducida va debajo, en itálica.
- **Tarjeta de brief:** fondo sky-soft con filas blancas (label + valor). El estado "✓ Ready for review" va en `sage`.
- **Pills de estado:** *In progress* (sky), *In review* (gold), *Revision requested* (coral), *Done* (sage), *Next* (gris).
- **Marcador:** subrayado `gold` al 42 % de alto que se "pinta" de izquierda a derecha. Para señalar problemas se usa la variante coral.
- **Etiquetas de honestidad:** "Concept demo" (pill gold) e "Illustrative role / example" (borde punteado gris). Son obligatorias cuando el contenido es simulado.

## 5. Movimiento

- **Entrada:** fade + 26 px hacia arriba, 0.5 s, `ease-out cubic`.
- **Aparición de elementos nuevos** (chips, tarjetas, checks): *pop* con rebote suave (`back-out`) desde escala 0.55.
- **Cambio de paso:** el panel sale hacia la izquierda en 0.3 s y el siguiente entra desde la derecha (+70 px) en 0.6 s, sin solaparse.
- **Cámara / zoom:** `ease-in-out cubic`, 1–1.4 s, zoom máximo ×1.6, siempre hacia el elemento que se está explicando.
- **Sonido** (si aplica): pop al aparecer, tick al completar, chime cuando algo está listo. Siempre sutil.

## 6. Voz y contenido

- Clara, inclusiva, cercana y orientada a resultados. Sin estereotipos ni promesas de ventas.
- El agente responde **en el idioma del dueño**. La UI nunca asume inglés ↔ español: usar "es → en · any language pair".
- **No inventar** métricas, precios, testimonios ni contrataciones. Lo simulado se etiqueta como tal.
- **El dinero lo controla el usuario:** el texto siempre muestra que el trabajo pagado empieza solo tras su aprobación.
