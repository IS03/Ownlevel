# Patrones de interfaz OWNLEVEL v1

> **Reemplazado en lo visual (octubre 2026).** Este documento es de la Web anterior a la marca: acento violeta, tamaños de Tailwind y radios propios. Para color, tipografía, radios, espacios, íconos, movimiento y tono, la referencia para Mobile y Web es [`docs/brand/ownlevel-marca/IDENTIDAD.md`](../brand/ownlevel-marca/IDENTIDAD.md) con los valores de `tema/tokens.ts`. Lo que sigue vale solo como contexto de la Web actual hasta su migración (M9.4) y para los principios no visuales (jerarquía, estados, invariantes).

Los patrones describen cómo reutilizar y consolidar lo existente. No obligan a crear nuevos componentes en este PR.

## Elegir la superficie

| Superficie | Cuándo usarla | No usarla para |
| --- | --- | --- |
| Página | tarea compleja, navegación propia o contexto durable | confirmación breve |
| Sección | agrupar una parte legible de una página | encapsular cada párrafo |
| Card | resumen o unidad con borde propio y lectura conjunta | lista larga de filas simples |
| Lista / fila | navegación, selección o registros repetidos | métricas que necesitan comparación visual |
| Inset / secundaria | contexto auxiliar dentro de una unidad | crear otro nivel de card |
| Sheet | contexto mobile ligado a la pantalla actual y que requiere alto vertical | tarea larga o navegación propia |
| Dialog | decisión puntual, confirmación o contenido acotado | formularios extensos o flujos de varios pasos |

En mobile un sheet se ancla abajo; en desktop el mismo contenido puede pasar a dialog centrado si conserva el contexto. No convertir todo en modal.

## Controles

| Patrón | Regla |
| --- | --- |
| Primary button | una acción dominante por contexto; violeta, label de verbo claro |
| Secondary / outline | alternativa real a la primaria, no una copia desaturada de todas las acciones |
| Ghost | acción auxiliar junto al contenido; mantener nombre accesible |
| Destructive | sólo mutación riesgosa; confirmar si el efecto no es reversible |
| Icon button | icono con `aria-label`, target de 44 px y tooltip cuando el significado no es obvio |
| Input / numérico | `Input` / `LocalizedDecimalInput`, label visible, unidad junto al campo, error inline |
| Fecha | `DateField`; conservar la fecha lógica de Córdoba |
| Search | control estable al inicio de lista o sheet; no moverlo con filtros |
| Select / filtros | opciones escaneables; selected suave y persistente; filtros locales no reordenan toda la página |
| Toggle / segmentado | estados mutuamente excluyentes y cortos; no usar para navegación profunda |
| Chip | filtro o atributo corto; nunca única señal de una acción crítica |

## Entrada y autenticación

La entrada es una composición de página, no una card de marketing. En mobile ocupa el alto disponible con safe areas, identidad visible, un único mensaje y una CTA de acceso; en desktop puede separar identidad y acción con espacio, no con un bloque dividido pesado. El botón conserva ancho y alto entre idle y pending; el error público se reserva cerca de la CTA para no desplazar la jerarquía.

La autenticación comunica sólo lo necesario: qué es OWNLEVEL, qué resuelve y cómo continuar. Los detalles técnicos de proveedores o configuración no llegan al usuario. El patrón reutilizable de PR24 es: marca semántica + `h1` real + mensaje breve + una acción de proveedor + feedback inline estable + cierre de confianza discreto.

## Listas, expandibles y selección

Las filas repetidas comparten altura, padding y foco. Toda fila con navegación es un objetivo único, no varios links competidores. Accordions se usan para detalle secundario dentro del flujo; el encabezado mantiene siempre título, progreso o estado que permita decidir si abrirlo.

Seleccionar un ejercicio u objeto muestra check/tint/borde suave. La CTA para confirmar (por ejemplo, **Agregar a la sesión**) conserva el peso violeta.

### Sesión activa

PR25 fija un patrón de foco para tareas secuenciales: un solo ejercicio abierto a la vez, encabezado estable y contenido que se revela dentro de la misma pieza. Cambiar de ejercicio guarda el anterior y compensa el desplazamiento del nuevo encabezado; no se reemplaza por un `scrollIntoView` agresivo. La fila cerrada conserva identidad, progreso y recordatorios suficientes para decidir el siguiente paso; el peso, las repeticiones y la ejecución pertenecen al estado abierto.

En filas densas de mobile, los controles finales tienen un rail reservado. El contenido flexible se trunca antes de desplazar contador, estado o chevron.

En el ejercicio abierto, las series dominan la jerarquía. Descanso, próxima vez y notas aparecen después, sin cards anidadas. Autosave usa un slot estable en el header y abre recuperación sólo ante error. Las operaciones destructivas continúan detrás de **Más opciones**, con acento rojo visible también cuando el disclosure está cerrado.

### Editor de rutina

PR26 fija el patrón de edición progresiva de una plantilla: el header expresa identidad de rutina, estado y conteo; la lista explica orden, ejercicio, metadata y objetivo aun cerrada. Nombre y color se editan en un sheet compacto, no como formulario permanente al inicio de la página.

El editor mantiene **un solo ejercicio abierto**. Colapsar o abrir otro nunca descarta sus overrides locales: una fila cerrada conserva `Sin guardar` hasta que se confirme el guardado explícito. Las mutaciones estructurales —agregar, reordenar, quitar, editar identidad o iniciar una sesión— se bloquean mientras haya objetivos dirty; salir del editor pide confirmación antes de descartarlos. Esto evita refreshes que destruyan un estado local que el usuario todavía ve.

Las series mantienen la misma semántica por fila y evitan scroll horizontal como solución por defecto. Descanso, próxima vez y observaciones siguen a las series; organización y quitar viven detrás de **Más opciones**, con destructive secundario y confirmación.

### Hub de entrenamiento

PR27 fija **Entrenar** como centro operativo: primero muestra la sesión en curso o la acción para iniciar una nueva, después la constancia mensual y finalmente accesos compactos para planificar y revisar. Una sesión activa no se descubre dentro de un selector: el hub enlaza directamente a **Continuar entrenamiento** y no ofrece una nueva sesión equivalente.

Cuando no hay sesión activa, **Nueva sesión** es una CTA directa y no una card que repite el título de la pantalla. La superficie con contexto operativo queda reservada para una sesión en curso, donde el nombre y **Continuar entrenamiento** sí evitan un paso innecesario.

**Progreso** conserva el análisis transversal. Dentro de ese área, Entrenamiento explica evolución y Cuerpo concentra peso y medidas; ambos mantienen sus rutas propias sin duplicarse como tiles del hub. **Historial** permanece en Entrenar porque responde a los hechos y registros ocurridos, no a sus tendencias.

### Today / nutrición diaria

PR28.1 fija Today como un flujo de contexto diario: resumen y registro primero, **Agregar rápido** compacto, actividad y pasos, y finalmente los registros del día. En desktop, comidas conserva una columna deliberada junto al contexto, sin duplicar markup.

PR31 consolida los pasos dentro de **Actividad de hoy** sin hacer permanente la edición. La superficie cerrada muestra sólo el resumen diario —trabajo, entrenamiento, gasto, balance, pasos, agua y mate— y abre un sheet/dialog para editar con el mismo autosave de pasos, agua y mate. Promedio de siete días, días con datos, historial y correcciones viven en ese detalle. Una segunda card no se mantiene si duplica el mismo dato y no suma una tarea distinta; el resumen debe recuperar densidad sin ocultar la interacción frecuente a más de un toque.

Las colecciones densas que se exploran con frecuencia, como una biblioteca de ejercicios, prefieren filas compactas y divisores antes que cards elevadas repetidas. Los filtros exponen sólo dimensiones que existen en el modelo y se mantienen como una herramienta secundaria junto a la búsqueda; las opciones más largas viven en un sheet o dialog responsive, con estado activo explícito.

En reportes mobile, el período se mantiene en una fila compacta y navegable; el estado pending confirma el cambio sin vaciar el contenido anterior. Las tendencias comparten un único workspace con la métrica activa y un detalle seleccionado de altura estable. Los gráficos reducen buckets y ticks cuando el rango crece, conservan gaps reales y distinguen hoy en curso de los días terminados. Los ejes de métricas no negativas parten de cero; balance conserva su base cero y explica déficit/superávit con texto además del color.

En colecciones históricas, la primera línea identifica el hecho y las siguientes explican el contexto necesario para decidir si abrirlo. Las métricas comparables conservan una etiqueta explícita: **Último** describe la ejecución más reciente y **Mejor** el máximo histórico; no se diferencian sólo por posición, color o tamaño. La continuidad resume la última sesión y la frecuencia por rutina sin convertirse en otro dashboard permanente.

Un calendario denso conserva el tamaño de sus celdas y targets: la altura se recupera desde el contenedor, no achicando días, números o marcas. Al abrir un día histórico, la fecha humana y el resumen responden primero qué ocurrió; las sesiones se presentan como filas navegables con duración, ejercicios y series. La identidad se toma del snapshot de la sesión; un color actual de rutina no se usa como si fuera histórico.

**Agregar rápido** es una fila secundaria que abre un sheet/dialog responsive; allí separa dos fuentes mediante búsqueda local y tabs: las **Comidas habituales** son plantillas que el usuario decidió guardar; las **Comidas sugeridas** se infieren automáticamente de `meal_entries` manuales históricos. Una sugerencia puede guardarse como habitual, pero nunca se convierte automáticamente por frecuencia.

Una comida cerrada es una fila/surface escaneable —título, calorías, macros, descripción limitada y **Editar**—, nunca un formulario abierto dentro de la lista. Editar ocurre en un único sheet responsive (dialog en desktop), conserva los campos y semánticas actuales y muestra el error cerca del formulario sin perder valores.

Las acciones destructivas viven detrás de **Más opciones** dentro del editor y requieren una confirmación explícita. El pending impide el doble envío y el éxito/error se comunica en un slot estable. El borrado usa el soft-delete canónico: el producto describe que el registro deja de contar y de aparecer, sin prometer una eliminación física.

### Alimentos por cantidad

PR29 separa catálogo y consumo. **Food** es una referencia cuantificable con porción y unidad canónicas; **MealEntry** es el snapshot histórico que resulta de usarla. Today ofrece **Manual** y **Desde alimento** dentro de la misma entrada, sin competir con Comidas sugeridas. El selector cotidiano muestra sólo alimentos activos y el servidor relee ownership, estado y nutrición antes de escalar la cantidad en la misma unidad.

El catálogo usa búsqueda, Activos / Archivados / Todos y filas compactas. Archivar es la salida cotidiana y conserva el Food; eliminar es una acción secundaria confirmada. El estado archivado siempre se expresa con texto o badge, no sólo con opacidad. Crear y editar ocurren en un sheet/dialog responsive, preservando `null` como desconocido y `0` como cero conocido.

### Comidas habituales y sugeridas

PR30 consolida cuatro roles distintos: **Food** es un ingrediente/base cuantificable; **SavedMeal** es una plantilla mutable administrada por el usuario; **SuggestedMeal** es un read model del historial; **MealEntry** es el snapshot del consumo ocurrido. Today muestra Habituales y Sugeridas juntas sólo como accesos rápidos, sin mezclar sus fuentes de verdad.

Una comida habitual puede ser manual o compuesta. Los componentes compuestos conservan su propio snapshot de cantidad, unidad y nutrición; la referencia opcional al Food es procedencia, no una dependencia viva. Editar o eliminar el Food no reinterpreta la plantilla. Los totales de la plantilla los calcula el servidor con escalado en la misma unidad, calorías enteras, macros a dos decimales y propagación de `null` por nutriente.

El `+` agrega la versión guardada en un toque. **Ajustar** cambia cantidades sólo para esa ocurrencia y nunca edita la plantilla. El navegador envía IDs y cantidades; el servidor relee ownership, estado y snapshots antes de crear una `MealEntry`. Editar, archivar o eliminar una habitual tampoco modifica las comidas ya registradas.

La gestión reutiliza búsqueda, Activas / Archivadas / Todas, filas compactas, estado archivado explícito y editor responsive. Archivar mantiene la plantilla; eliminar confirma el alcance, borra la plantilla y sus componentes, y deja intacto el historial.

## Sheets y dialogs

Los componentes actuales usan Base UI `Dialog` y varias envolturas locales. El patrón futuro debe mantener:

- backdrop, foco, cierre accesible y `Escape` correctos;
- header con título, contexto y cierre con nombre accesible;
- cuerpo scrolleable sin que el header ni el footer se desplacen;
- footer con CTA estable cuando la tarea requiere confirmación;
- altura máxima basada en `dvh`, safe areas y reduced motion.

### Agregar ejercicio durante una sesión

PR25 consolida este selector como sheet de geometría estable. Cambiar entre Todos, Espalda o una categoría sin resultados cambia únicamente el área central:

1. sheet de altura aproximadamente estable;
2. header fijo;
3. buscador y chips de filtro fijos;
4. lista de resultados interna y scrolleable;
5. footer y CTA fijos;
6. selección persistente y visualmente suave; CTA violeta fuerte;
7. crear un ejercicio nuevo como escape secundario, no como CTA equivalente.

Un filtro nunca descarta una selección válida. Si la fila seleccionada deja de estar visible, el footer conserva su nombre y permite confirmar o cambiar la elección.

### Agregar ejercicio a una rutina

El contexto de rutina reutiliza la geometría y jerarquía del selector de sesión, no su persistencia: sheet de alto estable, header/búsqueda/chips/footer fijos y sólo resultados con scroll. Busca por nombre, filtra por grupo y excluye los ejercicios que ya pertenecen a la plantilla; el servidor continúa siendo la autoridad contra duplicados. La selección persiste si el filtro deja de mostrarla y el CTA permanece deshabilitado hasta elegir una opción.

## Loading, feedback, errores y vacíos

| Estado | Patrón recomendado |
| --- | --- |
| Carga de página | skeleton que conserva jerarquía y tamaño del resultado; usar sólo si hay espera perceptible |
| Acción breve | pending inline en el botón + controles relacionados deshabilitados |
| Autosave | estado discreto, estable y cercano al objeto; `Guardando…`, `Guardado` o error recuperable |
| Éxito | confirmación breve e inline; no modal “se guardó” |
| Error | cerca del origen, en lenguaje entendible, con siguiente acción; no exponer internals |
| Empty state | qué falta + por qué importa + CTA clara; no una superficie vacía |

La interfaz de sesión ya contiene aprendizajes valiosos de autosave: no borrar drafts, no simular guardado y no permitir que feedback desplace series o CTA.

## Inventario de componentes y patrones existentes

| Componente / patrón | Ubicación actual | Estado | Acción futura |
| --- | --- | --- | --- |
| `Button` | `src/components/ui/button.tsx` | ✅ variantes, foco y tamaños coherentes | mantener; aplicar criterios de prioridad |
| `Card` | `src/components/ui/card.tsx` | 🟡 base sólida, riesgo de sobreuso | conservar y definir cuándo no usarla |
| `Input` + `Label` | `src/components/ui/` | ✅ alturas, foco y disabled consistentes | mantener |
| `DateField` | `src/components/ui/date-field.tsx` | ✅ fecha visible + picker nativo | mantener fecha lógica y tratamiento visual |
| `LocalizedDecimalInput` | `src/components/ui/localized-decimal-input.tsx` | ✅ semántica local explícita | mantener para números de dominio |
| `DateRangePicker` | `src/components/ui/date-range-picker.tsx` | 🟡 patrón útil, específico | consolidar criterios de selección/error cuando reaparezca |
| `ChartDetail` | `src/components/ui/chart-detail.tsx` | ✅ feedback accesible de charts | mantener como patrón de detalle contextual |
| `ResponsiveDialog` | `src/app/(app)/today/responsive-dialog.tsx` | 🟡 buena adaptación sheet/dialog | consolidar gradualmente como envoltura común |
| Sheets locales Base UI | entrenamiento, cuerpo, rutinas, ejercicios | 🟡 repiten estructura y radios | converger en futuros PRs sin refactor masivo |
| Accordions de sesión | `train/session/[id]/session-editor.tsx` | 🟡 funcionales, jerarquía exigida | replantear dentro de PR25 |
| Navegación mobile | `components/layout/bottom-nav.tsx` | ✅ clara y acotada | preservar mientras PR27 evalúa arquitectura Train |
| Sidebar desktop | `components/layout/desktop-sidebar.tsx` | ✅ agrupación y estados claros | mantener como referencia desktop |
| App shell | `components/layout/app-shell.tsx` | ✅ safe areas y límites mobile explícitos | mantener |
| Theme provider / selector | `components/providers/`, settings | ✅ roles light/dark existentes | mantener y validar contraste por cambio |
| Entrada / Login | `src/app/(auth)/login/login-form.tsx` | ✅ composición propia, CTA única y feedback estable | mantener; extender hacia onboarding sin rehacer identidad |
| Catálogo de Foods | `src/app/(app)/settings/nutrition/foods-catalog.tsx` | ✅ búsqueda, archivo, borrado confirmado y editor responsive | mantener separación Food / MealEntry; PR30 no debe convertirlo en recetas |
| Charts y selector de período | `components/nutrition/` | ✅ reportes informativos y accesibles | mantener como referencia; ampliar en PR35 |
| Empty / status inline | distribuidos por dominios | 🟡 semántica existe, presentación no unificada | consolidar lenguaje en cada rediseño |

No hay un componente compartido de toast, tabs, select, toggle o skeleton que deba imponerse ahora. Cuando una necesidad recurrente quede demostrada, se consolida desde la semántica y accesibilidad, no por abstracción anticipada.
