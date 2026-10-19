# Principios de diseño OWNLEVEL v1

> **Reemplazado en lo visual (octubre 2026).** Este documento es de la Web anterior a la marca: acento violeta, tamaños de Tailwind y radios propios. Para color, tipografía, radios, espacios, íconos, movimiento y tono, la referencia para Mobile y Web es [`docs/brand/ownlevel-marca/IDENTIDAD.md`](../brand/ownlevel-marca/IDENTIDAD.md) con los valores de `tema/tokens.ts`. Lo que sigue vale solo como contexto de la Web actual hasta su migración (M9.4) y para los principios no visuales (jerarquía, estados, invariantes).

## Dirección de producto

OWNLEVEL hoy es un producto personal que funciona; se diseña desde ahora para ser personalizable y comprensible también para una persona que llega con una cuenta vacía. Cada decisión debe responder dos preguntas:

1. ¿ayuda a registrar o entender lo importante en este momento?
2. ¿seguiría teniendo sentido para otra persona, sin datos ni supuestos personales globales?

La libertad para replantear producto no altera las invariantes: ownership, RLS, snapshots históricos, `day_logs` y `meal_entries` canónicos, fecha Córdoba, idempotencia, autosave, drafts, conflictos y optimistic locking se preservan.

## Referencias internas

**Home** y **Reportes** son la dirección aprobada. Comparten una jerarquía legible, información principal visible rápido, superficies sobrias, densidad controlada y violeta usado como identidad o foco. No deben copiarse sus cards, gráficos ni composición literalmente: cada tarea necesita su propia estructura.

La pregunta de control para un rediseño es: **¿se siente parte del mismo producto que Home y Reportes?**

## Principios visuales

### Jerarquía antes que decoración

La importancia se comunica primero con orden, tamaño, contraste, espacio y posición. Un borde, una sombra o un color no deben ser la única señal de jerarquía. Cada página necesita un título claro, una acción principal como máximo por contexto y secciones que se puedan recorrer de arriba hacia abajo.

### Cards no son el layout por defecto

Una card agrupa contenido que debe leerse como una unidad. Una lista, una sección con separadores o una superficie simple suele ser mejor para filas repetidas, formularios largos y navegación. Evitar `card → card → card` salvo que cada nivel tenga una relación semántica distinta.

### Violeta con intención

El violeta es identidad, foco y acción primaria. No debe convertir todas las filas interactivas en CTA. Un elemento seleccionado usa una señal suave (tint, borde o check); la acción que confirma algo usa el violeta fuerte. Rojo queda reservado a errores y acciones destructivas.

### Estabilidad espacial

Una interacción local debe cambiar la zona local. Filtros cambian resultados, no la altura de toda la pantalla ni la posición de una CTA o footer. Feedback de guardado, error o éxito debe ocupar un espacio previsto o ser inline/overlay discreto. Los skeletons conservan el tamaño y el orden del contenido final.

### Mobile-first deliberado

Se diseña primero la tarea crítica en 375–430 px, incluyendo safe areas, teclado, scroll y targets táctiles. Desktop no es mobile estirado: puede sumar ancho, columnas y navegación contextual cuando mejora la lectura o el análisis.

### Densidad y revelación progresiva

OWNLEVEL registra mucha información, pero no toda es necesaria ahora. La ejecución muestra lo necesario para continuar; el contexto secundario vive en expandibles, details, sheets o dialogs. No esconder acciones críticas ni los datos que evitan un error de registro.

## Tokens y escala práctica

PR23 reutiliza los tokens CSS y utilidades Tailwind actuales. No introduce una segunda capa de design tokens.

### Tipografía

| Rol | Uso | Base actual recomendada |
| --- | --- | --- |
| Título de página | tarea o destino | `text-2xl` / `text-3xl`, `font-semibold`, tracking ajustado |
| Título de sección | bloque principal | `text-lg` o `text-xl`, `font-semibold` |
| Título de card o fila | unidad escaneable | `text-base`, `font-medium` |
| Métrica | valor que decide | `text-2xl` o `text-3xl`, `font-semibold`, `metric-number` |
| Cuerpo | explicación operativa | `text-sm` / `text-base` |
| Secundario | contexto, unidad, fecha | `text-sm text-muted-foreground` |
| Caption / label | metadato o campo | `text-xs` / `text-sm`, `font-medium` cuando etiqueta |

No crear escalas de muchos niveles. Números comparables usan tabulares.

### Espaciado

| Situación | Recomendación |
| --- | --- |
| Padding horizontal de página | `px-4` mobile; `lg:px-8` / `xl:px-10` desktop |
| Separación entre secciones | `space-y-6` como base; `space-y-8` para bloques mayores |
| Padding de card | `p-4`; compacto `p-3` |
| Fila o control | altura mínima de 44 px; padding lateral `px-3` |
| Campos de formulario | `gap-3` o `space-y-4` |
| Acciones relacionadas | `gap-2`; no dispersarlas por la pantalla |

### Radio, borde y elevación

`--radius` actual (14 px) es la referencia. Usar `rounded-lg` para controles y filas, `rounded-xl` para cards, y radio amplio (`rounded-t-[1.5rem]` o `[1.75rem]`) sólo para sheets. Pills quedan para tags, contadores o filtros cortos, no para todos los botones.

Un borde semántico define separación en listas, inputs y cards. Sombra leve acompaña una superficie elevada sobre fondo; borde + sombra fuerte a la vez es excepcional. En dark mode priorizar contraste de superficie y borde tenue antes que sombras oscuras acumuladas.

### Color semántico

| Token / familia | Uso |
| --- | --- |
| `primary` violeta | CTA primaria, foco, enlace destacado, progreso y selección fuerte |
| `background`, `card`, `popover` | plano base y capas de contenido |
| `foreground`, `muted-foreground` | jerarquía de texto; muted nunca para información crítica sola |
| `border`, `input`, `ring` | estructura, control y foco visible |
| success | confirmación discreta, siempre acompañada de texto o icono |
| warning | atención que no bloquea; no convertirlo en destructive |
| `destructive` rojo | eliminar, riesgo o error; nunca identidad normal de rutina |
| rutina: violet, indigo, blue, cyan, green, yellow, orange, rose | identidad de rutina; mantener la paleta existente y su contraste por tema |

Light y dark usan los mismos roles, no la misma luminosidad. Las decisiones de contraste se validan en ambos antes de implementar cambios visuales.

## Estados e interacción

Todo control debe contemplar default, hover (si aplica), pressed, selected, disabled, loading, success, warning, error y destructive. `selected` no es sinónimo de `primary`; loading no debe permitir una segunda mutación; disabled debe explicar visualmente y, cuando sea necesario, textualmente qué falta.

Priorizar transiciones breves de `opacity`, `transform`, color y borde. Respetar `prefers-reduced-motion`, evitar animaciones continuas y no animar propiedades que causen reflow perceptible.

## Accesibilidad básica no negociable

- foco visible y consistente mediante `ring`;
- objetivo táctil de al menos 44 × 44 px para controles frecuentes;
- labels asociados a inputs y nombre accesible en icon buttons;
- contraste suficiente en ambos temas;
- color nunca como única señal de estado;
- errores cercanos al origen, entendibles y sin detalles internos;
- cambio de estado anunciado cuando corresponda con `aria-live` / `role=status`;
- la reducción de movimiento no elimina información ni bloquea el flujo.

## Anti-patrones a evitar

- cards anidadas o cards como única forma de layout;
- múltiples CTA violetas compitiendo en el mismo viewport;
- usar rojo como color habitual de rutina;
- sheet cuya altura salta según resultados, moviendo búsqueda o CTA;
- éxito/error que inserta contenido y desplaza controles críticos;
- skeleton que no representa el layout final;
- modal para una tarea que necesita navegación, persistencia o mucho contexto;
- esconder la única acción necesaria detrás de un menú por “limpiar” la pantalla.
