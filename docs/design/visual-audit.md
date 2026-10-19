# Auditoría visual y UX global — PR23

> **Reemplazado en lo visual (octubre 2026).** Este documento es de la Web anterior a la marca: acento violeta, tamaños de Tailwind y radios propios. Para color, tipografía, radios, espacios, íconos, movimiento y tono, la referencia para Mobile y Web es [`docs/brand/ownlevel-marca/IDENTIDAD.md`](../brand/ownlevel-marca/IDENTIDAD.md) con los valores de `tema/tokens.ts`. Lo que sigue vale solo como contexto de la Web actual hasta su migración (M9.4) y para los principios no visuales (jerarquía, estados, invariantes).

## Método y alcance

Auditoría realizada el 28 de agosto de 2026 sobre el código de `main` y la producción autenticada de `https://www.ownlevel.fit`, sin crear ni modificar datos. Se inspeccionaron visualmente Home, Today, Reportes, Train, Ajustes y una sesión activa; además se inventariaron todas las rutas actuales y los patrones de interfaz que las sostienen. La superficie, bordes, muted, violeta, destructive y selected se contrastaron en claro y oscuro; el tema quedó restaurado a Sistema.

La captura productiva directa estuvo disponible en 1363 × 936 (desktop). El shell de producción declara una composición mobile de 320–430 px, bottom nav, safe areas y contenido máximo de 430 px; la herramienta administrada no permitió cambiar su viewport a 390 × 844. La verificación visual exacta de ese viewport queda como primer paso obligatorio de cada PR de rediseño, junto con light/dark. Esta limitación no se oculta ni se compensa cambiando producto en PR23.

## Lectura transversal

### ✅ Mantener

- **Home:** referencia interna de jerarquía; el estado operativo, las métricas y los accesos están bien ordenados.
- **Reportes de nutrición:** referencia interna de lectura analítica; período, resumen y tendencias separan bien la información.
- **Shell y navegación actual:** el límite mobile, safe areas, bottom nav y sidebar desktop responden a roles distintos sin duplicar rutas.
- **Tema y tokens base:** light/dark, violeta semántico y paleta de rutinas ya ofrecen una base visual coherente.
- **Integraciones ChatGPT:** configuración compacta, explicación de estado y acciones acotadas; no necesita rediseño dentro de esta etapa.
- **Sesión activa v2:** foco secuencial, jerarquía de series, autosave estable y selector de altura fija resuelven la dirección de PR23 sin cambiar semántica de entrenamiento.

### 🟡 Mejorar

- **Today / Nutrición:** resumen, comidas, actividad y pasos mantienen fuentes canónicas; la arquitectura actual prioriza registro rápido y contexto diario antes de la lista de comidas.
- **Train hub:** calendario, CTA y accesos sirven, pero la estructura de entrada debe alinearse con una arquitectura Train futura.
- **Lista de rutinas:** conserva flujos válidos y ahora usa una densidad más deliberada; la arquitectura Train se revisará por separado.
- **Biblioteca, historial, calendario y progreso de entrenamiento:** los datos y filtros son útiles; falta una jerarquía común entre exploración, historial y análisis.
- **Cuerpo, peso y medidas:** registros y sheets funcionales; requieren una presentación más clara a medida que las métricas sean configurables.
- **Ajustes y subáreas nutricionales:** el agrupamiento es entendible, aunque los formularios/versiones necesitan lenguaje de lista, estado y empty más consistente.
- **Historial diario y progreso global:** hechos y enlaces están disponibles, pero precisan una lectura transversal de semántica y tendencias.

### 🔴 Replantear

- **Crear / editar rutina:** no conviene acumular ajustes en el editor actual. Debe ser excelente para una cuenta nueva y una rutina compleja. PR26.
- **Alimentos por cantidad y comidas habituales:** resueltos en PR29/PR30 como catálogos separados, con snapshots estables en las comidas registradas.

## Inventario de áreas y próxima decisión

| Ruta / área | Estado | Qué conservar | Dirección recomendada | PR |
| --- | --- | --- | --- | --- |
| `/login` | ✅ Mantener | Auth estable, identidad clara, CTA única y feedback inline | mantener composición de página; extender hacia onboarding sin rehacer identidad | resuelto PR24 |
| `/home` | ✅ Mantener | foco operativo, CTA contextual, resumen semanal | referencia de lenguaje, mantenimiento menor | — |
| `/today` | ✅ Mantener | datos canónicos, quick add, actividad compacta | contexto diario antes de comidas; edición responsive y borrado confirmado | resuelto PR28.1 |
| `/today/reports` y `/today/steps` | ✅ / 🟡 | período, resumen, charts accesibles | preservar claridad; expandir análisis luego | PR35 |
| `/train` | ✅ Mantener | sesión operativa, calendario y accesos compactos | Train concentra hacer, planificar y revisar; Progreso concentra análisis | resuelto PR27 |
| `/train/routines` | ✅ Mantener | archivo, inicio y colores | lista compacta y entrada clara al editor | resuelto PR26 |
| `/train/routines/[id]` | ✅ Mantener | snapshots y acciones existentes | editor progresivo con estructura visible y guardado explícito | resuelto PR26 |
| `/train/session/new` | 🟡 Mejorar | inicio desde rutina/libre | alinear con futura entrada de Train | PR27 |
| `/train/session/[id]` activa | ✅ Mantener | autosave, drafts, progreso y foco secuencial | mantener jerarquía v2; medir uso real | resuelto PR25 |
| ejercicio abierto/cerrado, series, notas, próxima vez, más opciones | ✅ Mantener | un ejercicio abierto, header estable y detalle sin cards anidadas | mantenimiento y accesibilidad continua | resuelto PR25 |
| selector Agregar ejercicio | ✅ Mantener | sheet estable, selección persistente y footer fijo | ampliar filtros sólo con evidencia | resuelto PR25 |
| finalizar / cancelar | ✅ Mantener | flush antes de finalizar y destructive secundario | preservar separación de jerarquía | resuelto PR25 |
| `/train/exercises` | 🟡 Mejorar | biblioteca personal, filtros | consolidar exploración y edición | PR27 |
| `/train/history`, `/train/history/[exerciseId]` | 🟡 Mejorar | histórico por ejercicio | lenguaje común de análisis | PR27 / PR35 |
| `/train/progress`, `/train/calendar`, `/calendar` | 🟡 Mejorar | hechos, constancia y filtros | agrupar análisis sin perder contexto | PR27 / PR35 |
| `/train/body` | 🟡 Mejorar | peso y medidas canónicos | preparar métricas configurables | PR33 |
| `/history` | 🟡 Mejorar | correcciones y hechos diarios | revisar calidad/semántica | PR34 |
| `/progress` | 🟡 Mejorar | punto de entrada a análisis | definir arquitectura de reportes | PR35–37 |
| `/settings` y `/settings/profile` | 🟡 Mejorar | agrupación, tema, seguridad | despersonalizar y modularizar sin romper perfil | PR42 / PR45 |
| `/settings/nutrition` + objetivos/gasto/horario | 🟡 Mejorar | períodos versionados y contexto | simplificar orientación de configuración | PR28 |
| `/settings/nutrition/foods` | ✅ Mantener | catálogo cuantificable, archivo, búsqueda y ownership | mantener separado de futuras comidas guardadas | resuelto PR29 |
| `/settings/nutrition/meals` | ✅ Mantener | plantillas manuales/compuestas, archivo, búsqueda y ownership | mantener separado de Foods y sugerencias históricas | resuelto PR30 |
| `/settings/nutrition/integrations` | ✅ Mantener | clave, estado, revocación | mantenimiento, sin ampliar alcance de datos | — |
| Tema | ✅ Mantener | Claro/Oscuro/Sistema | validar contrastes por cada rediseño | continuo |

## Decisiones confirmadas para próximos PRs

### PR24 — Login / Entrada

**Resuelto.** La entrada dejó la card partida por una composición de página: símbolos canónicos claros/oscuros, un mensaje breve, una única CTA de Google y un cierre discreto. En desktop la identidad y la acción se separan por espacio y jerarquía, no por un contenedor pesado; en mobile se conservan safe areas. El pending mantiene tamaño del botón y el error público se reserva inline, sin exponer detalles de OAuth. Google OAuth, callback y redirects seguros permanecen sin cambios. La verificación productiva visual quedó disponible en desktop; la herramienta administrada no permitió emular exactamente 390 × 844 ni alternar el tema del sistema, por lo que mobile y light/dark se cubren estructuralmente con breakpoints, safe areas, tokens y assets semánticos, sin declarar una comprobación visual inexistente.

### PR25 — Sesión activa v2

**Resuelto.** La sesión usa foco secuencial con un ejercicio abierto a la vez, encabezado persistente, compensación de scroll y transición local breve. La fila cerrada resume identidad, avance y series; la abierta prioriza series y expone descanso, próxima vez y notas sin otro accordion principal. El acento de rutina orienta sin competir con estados success o destructive.

El selector **Agregar ejercicio** mantiene altura basada en `dvh`, header/búsqueda/chips/footer fijos y sólo desplaza resultados. La selección no se pierde al filtrar, permanece nombrada en el footer y usa un estado suave distinto de la CTA primaria. El empty state conserva geometría y crear un ejercicio nuevo sigue como salida secundaria.

Permanecen sin cambios `ExerciseAutosaveQueue`, drafts versionados, optimistic locking, reconciliación de conflictos, retries, session fences, snapshots, notas, decisiones de próxima sesión y `apply_to_routine`.

### PR26 — Crear / editar rutinas v2

**Resuelto.** Crear una rutina continúa siendo un primer paso corto de nombre y color; una plantilla vacía explica qué falta y concentra la primera acción. El editor prioriza la estructura: header con identidad, estado y conteos; lista escaneable con orden, metadata y objetivo; nombre/color bajo disclosure en sheet.

Sólo un ejercicio se abre a la vez. Sus cambios locales sobreviven al collapse y se muestran como `Sin guardar` hasta el guardado explícito por ejercicio. Agregar, reordenar, quitar, editar identidad e iniciar entrenamiento quedan protegidos mientras existan objetivos pendientes, y salir del editor requiere confirmación para descartar cambios.

El selector de ejercicios de rutina adopta la geometría estable de PR25, con búsqueda, chips, resultados internos scrolleables, selección persistente, CTA fija y exclusión de duplicados. La persistencia sigue usando las server actions y validaciones existentes; no se alteran ownership ni snapshots.

### PR27 — Arquitectura Train

**Resuelto.** `/train` es el centro operativo del entrenamiento: sin una sesión activa presenta **Nueva sesión** mediante el selector existente; con una sesión en curso muestra su nombre y enlaza directamente a **Continuar entrenamiento**. El calendario conserva su papel de constancia mensual y las acciones restantes se organizan como **Planificar** (Rutinas y Ejercicios) y **Revisar** (Historial).

`/train/progress` y `/train/body` conservan sus rutas y deep links, pero su entrada canónica es `/progress`: el primero explica la evolución de entrenamiento y el segundo concentra el seguimiento corporal. Historial queda en Train porque muestra sesiones y registros ocurridos. No se modifica la navegación global ni las experiencias cerradas de sesión activa y rutinas.

### PR28 — Today / Nutrición v2

**Resuelto.** PR28.1 prioriza cómo viene el día, registrar una comida, consultar sugerencias históricas, actividad y pasos antes de revisar los registros del día. La fecha se presenta como lenguaje de producto y el editor de nueva comida evita exponer la regla interna de Córdoba sin cambiarla. Las **Comidas sugeridas** siguen siendo sugerencias históricas plegadas, no Foods ni comidas guardadas.

La lista de comidas abandona el formulario inline: cada registro se consulta como una fila compacta y se edita en un sheet/dialog responsive único. El borrado sigue usando soft-delete canónico, pero ahora exige una confirmación, comunica pending, éxito o error y no promete una eliminación física. Actividad, pasos, agua, mate y correcciones permanecen intactos y se muestran antes de las comidas en mobile.

### PR29 — Alimentos habituales v2

**Resuelto.** El catálogo diferencia Activos, Archivados y Todos, busca por nombre y usa filas compactas con estado explícito. Crear y editar dejan el flujo inline por un sheet/dialog responsive; archivar/reactivar sigue siendo la mutación cotidiana y eliminar exige confirmación.

Today conserva el registro Manual y suma **Desde alimento**: el usuario elige un Food activo, indica una cantidad en su unidad canónica y ve una preview con la misma regla compartida que el servidor. La mutación sólo recibe identidad, cantidad y fecha; relee ownership y valores canónicos antes de crear una `meal_entry` snapshot. Editar, archivar o eliminar el Food no reinterpreta el historial.

### PR30 — Comidas habituales / guardadas

**Resuelto.** `/settings/nutrition/meals` administra plantillas manuales y compuestas mediante búsqueda, Activas / Archivadas / Todas, filas compactas y editor responsive. Los componentes son snapshots nutricionales: borrar o editar el Food de origen no rompe la plantilla. Archivar conserva; eliminar confirma y sólo remueve la plantilla y sus componentes.

Today ofrece **Agregar rápido** como acceso compacto que abre un sheet/dialog responsive con búsqueda y tabs **Habituales** / **Sugeridas**. El `+` habitual crea una comida desde valores canónicos releídos por el servidor; una compuesta ofrece **Ajustar** para modificar sólo la ocurrencia. Las Sugeridas mantienen el algoritmo histórico de 60 días y suman una acción separada para guardarlas explícitamente como habitual. Ninguna plantilla o sugerencia reescribe `meal_entries` ya creadas.

### PR31 — Core Mobile UI v2

**En validación física final.** La densidad mobile se ajusta sin reducir las áreas táctiles: Perfil usa padding vertical equilibrado y Apariencia elimina espacio externo redundante conservando las tres opciones de tema. En Train, una nueva sesión se inicia desde una CTA directa; sólo una sesión en curso conserva una superficie con contexto operativo.

### PR32 — Biblioteca de ejercicios v2

La Biblioteca pasa de cards elevadas repetidas a una lista compacta de filas y divisores, agrupada por grupo muscular cuando no hay una búsqueda en curso. La búsqueda local cubre la identidad disponible del ejercicio y el único filtro actual —grupo muscular— se presenta como chips densos dentro de un sheet responsive.

### PR33 — Historial de entrenamiento v2

Historial conserva las dos preguntas de producto sin duplicar jerarquía: **Sesiones** prioriza una continuidad compacta y filas navegables de sesiones finalizadas; **Por ejercicio** usa búsqueda local, filtros reales de rutina y músculo, y filas de alta densidad donde **Último** y **Mejor** permanecen explícitamente diferenciados. El detalle de ejercicio y el modo Progreso siguen siendo superficies separadas.

### PR34 — Calendario de entrenamiento v2

El preview mensual conserva celdas, puntos y targets táctiles, pero elimina aire exterior redundante. El detalle de un día usa fecha localizada de Córdoba y un resumen calculado únicamente desde sesiones `completed`: las duraciones se suman por sesión real y las filas conservan nombre snapshot, horario, ejercicios y series. El filtro administrativo del día no se repite; un filtro de rutina ya elegido en Calendario permanece sólo como contexto de URL y back navigation.

Today une Actividad y Pasos en una sola superficie compacta: su estado cerrado prioriza trabajo, entrenamiento, gasto, balance, pasos, agua y mate; al abrir, el mismo estado local y autosave conservan la edición, el promedio de siete días, el historial y las correcciones. Trabajo, entrenamiento, gasto, balance y correcciones preservan sus fuentes y acciones; pasos no modifica automáticamente gasto ni balance.

## Roadmap visual y de producto

| Etapa | Alcance |
| --- | --- |
| PR23 | Design System v1 + auditoría visual global |
| PR24–30 | Login, sesión activa, rutinas, Train, Today, alimentos por cantidad y comidas guardadas |
| PR31–34 | suplementos, notificaciones, métricas configurables, calidad de datos |
| PR35–39 | reportes, tendencias, comparaciones, métrica de fuerza, performance/a11y/reliability |
| PR40–45 | fotos, integraciones de salud, despersonalización, empty states, onboarding, módulos/preferencias |
| PR46–50 | aislamiento multiusuario, amigos, privacidad, compartir, copias de rutinas |
| PR51+ | IA nativa |

El roadmap no autoriza implementación anticipada. Cada PR debe conservar las fuentes canónicas y validar la experiencia de una cuenta vacía cuando aplique.
