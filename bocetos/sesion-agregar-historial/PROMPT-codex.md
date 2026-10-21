# Sesión en curso: agregar y quitar ejercicios, "Sumar a la rutina" e historial por rutina

Lee primero AGENTS.md (sección "Identidad de marca" y "Security/reliability"), docs/brand/ownlevel-marca/IDENTIDAD.md, tema/tokens.ts y docs/mobile/m9-brand-polish-plan.md (§9b, §10, §11).

**Ojo: esto toca la sesión en curso (M3.3), que es zona protegida.** El plan M9 dice que ahí solo van cambios visuales. Lo de acá es un pedido explícito del producto que suma comportamiento y backend. Por eso va en **pasos separados**, cada uno con su PR, sus tests y su QA. **No cambies la semántica de drafts, autosave, CAS/conflictos, timer ni la idempotencia existentes.** Todo lo que escriba datos usa los caminos que ya existen, salvo lo que este prompt pide explícitamente como EXPAND.

Contexto: va junto con los rediseños de la biblioteca de rutinas, el editor de rutina y la biblioteca de ejercicios (`bocetos/rutinas-biblioteca/`, `bocetos/rutina-editor/`, `bocetos/biblioteca-ejercicios/`, cada uno con su PROMPT-codex.md). Reutilizá sus piezas: la hoja "Agregar ejercicios", la hoja de ejercicio nuevo, el aviso con "Deshacer", los chips y el vidrio. Además, decisión de producto ya tomada: **el ejercicio no tiene valores por defecto; todo ejercicio agregado arranca vacío**.

## Bocetos (fuente visual)

Carpeta: `bocetos/sesion-agregar-historial/` (PNG exportados de Pencil; el `.pen` está en `bocetos/bocetos.entrenar.pen`, encriptado). Cada lámina tiene arriba una nota que explica la intención. Los bocetos usan Inter y Lucide: en iOS va la fuente del sistema y SF Symbols. Nombres, fechas y pesos son de ejemplo.

- 01-selector-agregar.png
- 02-recien-agregado-usar-ultima-vez.png
- 03-quitado-deshacer.png
- 04-sumar-a-la-rutina.png
- 05-historial-completo-por-rutina.png
- 06-historial-rapido-sesion.png
- 07-encabezado-al-bajar.png
- 08-encabezado-al-subir.png

## Reglas de producto (valen para todos los pasos)

- Agregar o quitar un ejercicio en la sesión **nunca cambia la rutina**. La única excepción es "Sumar a {RUTINA}" (paso 3), que se aplica recién al finalizar y solo si el usuario lo activó.
- Se agrega **de a un ejercicio por vez**.
- Un ejercicio agregado arranca **vacío**: 1 serie sin peso, reps ni RIR, y sin rango de descanso.
- missing ≠ zero: un valor vacío se ve vacío o con "—" en gris, nunca 0.
- empty ≠ unavailable: "sin historial" es distinto de "no pudimos cargar el historial".

## Paso 1 · Mobile (sin backend): encabezado que se achica, selector, ejercicio recién agregado, avisos e historial rápido

Archivos: `active-session-sheets.tsx` (`SessionExercisePicker`, `SessionQuickHistory`), `active-session-screen.tsx`, `active-session-exercise-card.tsx`, `active-session-controller.ts`, `active-session-model.ts`, `session-glass-button.tsx`, `session-native-interactions.tsx` (y su test de layout) y el API `active-session.ts`.

**Encabezado que se achica al scrollear, estilo Safari (láminas 07 y 08)**
- **Arriba de todo:** el encabezado de hoy, sin cambios: botones "‹ Entrenar" y "Finalizar" (con el ícono de descartar), "PUSH" grande, tiempo, "En curso · 0/24 series · 0/8 ejercicios" y barra de progreso.
- **Al scrollear hacia abajo** (cuando "PUSH" grande sale de vista):
  - Aparece una **barra de vidrio fina** arriba (vidrio permitido: barra superior al hacer scroll) con "PUSH" centrado y, debajo, "11 min · 3/24 series" en chico, con cifras tabulares.
  - En su borde inferior, una **línea de progreso** (acento sobre `elevated`).
  - **El tiempo nunca se esconde.**
  - Los botones "Entrenar" y "Finalizar" **se esconden con un fundido**.
- **Apenas el usuario scrollea hacia arriba**, aunque sea un poco y en cualquier punto de la lista, los botones **vuelven** en la misma barra, a los costados del nombre. Al seguir bajando se vuelven a esconder.
  - Usá un umbral chico de movimiento para que no parpadeen con microscrolls ni con el rebote del borde.
- **Siempre visibles** (no se esconden nunca) cuando hay VoiceOver activo, con "Reducir movimiento" (ahí sin animación; aparecen y desaparecen con fundido o quedan fijos) y mientras hay una hoja, un diálogo o el teclado abierto.
- **Mismas acciones y mismos flujos que hoy:** volver a Entrenar, descartar con su confirmación y finalizar. Solo cambia dónde y cuándo se ven. No toques la lógica de la sesión.
- Funciona igual en Android, con fallback sólido para el vidrio, y en iOS anterior a 26.

**Selector (lámina 01)**
- Misma hoja que "Agregar ejercicios" del editor de rutina (buscador nativo, chips de grupo muscular, filas de lista), pero **un toque en la fila agrega y cierra**. Fuera el paso de elegir y después confirmar con "Agregar a la sesión".
- Los que ya están en la sesión se ven apagados con "En la sesión" y no se pueden tocar.
- Primera fila: "Crear ejercicio nuevo" (con búsqueda activa, "Crear "…""). Abre la hoja de ejercicio nuevo de la biblioteca y, al crearlo, lo agrega a la sesión como hoy (`manual_new`).

**Ejercicio recién agregado (lámina 02)**
- Respetar la tarjeta actual de la sesión: "Serie 1 de 1 · Historial", la tabla # · KG · REPS · RIR · ✓, "+ Agregar serie" junto a "Próxima vez ⌄" y "Descanso · sin rango / Iniciar descanso".
- Al agregarlo: aparece al final, **abierto**, y la pantalla lo lleva a la vista.
- Aviso flotante "PULLOVER agregado" con **Deshacer**, que usa el quitar existente. Si el usuario ya cargó o completó algo, Deshacer deja de ofrecerse.
- **Tarjeta "La última vez"**: si el ejercicio tiene historial, se muestra "La última vez · 5 oct · PULL" con sus series ("55 kg × 12 · 12 · 10") y el botón **Usar**.
  - Toma la sesión finalizada más reciente con ese ejercicio, **en cualquier rutina**, y siempre dice de qué fecha y rutina viene.
  - **Usar** carga cantidad de series, peso y reps (y RIR si corresponde; verificá qué representa el RIR del historial) **por el mismo camino que si el usuario los escribiera** (draft y autosave existentes). Nada se aplica solo.
  - **Deslizar la tarjeta hacia un costado la descarta**, y no vuelve para ese ejercicio en esta sesión. Para VoiceOver, una acción "Descartar".
  - Sin historial, la tarjeta no aparece. Historial no disponible: tampoco aparece, sin mensaje de error en la tarjeta.
  - Fuente: el `quickHistory` del detalle de la sesión (ya trae `routineId` y `sets`). Verificá que después de agregar el ejercicio el detalle traiga su historial. Si no lo trae, proponé cómo obtenerlo sin backend nuevo, o marcá BLOCKED.

**Quitar (lámina 03)**
- Mismo aviso: "PULLOVER quitado" con **Deshacer**.
- **Sin series completadas:** se quita al toque, con aviso y Deshacer.
- **Con series completadas:** primero se pide confirmación (se pierden datos de hoy), como corresponde a una acción destructiva.
- Deshacer no puede perder ni inventar datos. Proponé y justificá el mecanismo (por ejemplo, demorar la confirmación al servidor mientras el aviso está visible, o restaurar con los caminos existentes) teniendo en cuenta el autosave, el CAS y que la app se cierre en el medio.

**Historial rápido de la sesión (lámina 06)**
- Tiene que ser **simple**: estás entrenando y querés ver qué hiciste las últimas veces en esta rutina o, si querés, en general. Sin récords, gráficos, "mejor marca" ni enlaces que te saquen de la sesión. Eso vive en el historial completo de la Biblioteca (`bocetos/historial/`), que es otra pantalla.
- La hoja "Historial" de cada ejercicio, rediseñada:
  - Chips "Todas · PUSH · PULL" (las rutinas que aparecen en su historial), **arrancando en la rutina de la sesión actual**. En una sesión libre, arranca en "Todas".
  - Tarjetas neutras: **sin el fondo champagne** de "Última sesión", porque el acento está reservado para lo principal.
  - Fecha corta ("Jue 8 oct"), con el año solo si no es el actual.
  - Series con cifras tabulares. Aclarar si el RIR es objetivo o real con una etiqueta breve que no confunda.
  - La decisión que se tomó ese día, si existe ("Pediste más peso para la próxima").
  - Botón **Usar** en cada sesión (mismo comportamiento que la tarjeta de la lámina 02).
  - Sin enlace al historial completo.
  - Filtro sin resultados: "Todavía no lo hiciste en PUSH" con un acceso a "Todas".
- En este paso el filtro es local sobre `quickHistory`, que hoy trae hasta 6 sesiones. Si con eso el filtro queda pobre, anotalo para el paso 4.

## Paso 2 · Backend: agregar en la sesión arranca vacío

- Hoy `append_workout_exercise` (migración `20260929220000_mobile_active_session_expand.sql`) copia desde el ejercicio `series_sugeridas`, `reps_sugeridas`, `peso_sugerido`, `rir_sugerido` y el descanso sugerido. Además precarga los valores **reales** de cada serie.
- Nueva migración que reemplace la función para que cree **1 serie con objetivo y real en null** y snapshots de descanso en null.
- Mantener intacto todo lo demás: bloqueo de sesión activa, ownership, chequeo de duplicado, ejercicio activo, orden, `source_type` y errores.
- Tests en `supabase/tests` y en los tests de la API Mobile.
- Verificá que la Mobile maneje bien el descanso sin rango: el timer se puede iniciar sin rango sugerido.
- Esta RPC también la usa la Web: allá también va a arrancar vacío. Está aceptado (la Web se rediseña al final y no va a ser para entrenar), pero dejalo dicho en el PR.
- **No apliques la migración a la base remota sin mi OK explícito.**

## Paso 3 · Backend + Mobile: "Sumar a {RUTINA}" al finalizar (lámina 04)

**Hoy:** "Tomar resultado de hoy" (`apply_to_routine`) solo actúa sobre ejercicios con `routine_exercise_id`. Un ejercicio agregado en la sesión nunca se suma a la rutina.

**Mobile:**
- En "Próxima vez" de un ejercicio **agregado en la sesión**, cuando la sesión viene de una rutina, el switch dice **"Sumar a PUSH"** (con el nombre de la rutina), con la pista "Al finalizar, se agrega al final de la rutina con las series de hoy."
- Para los ejercicios que ya venían de la rutina, sigue "Tomar resultado de hoy" sin cambios. En una sesión libre, la opción no aparece.
- Apagado por defecto.

**Backend (EXPAND):**
- Al finalizar, para cada ejercicio agregado con la opción activa y con series completadas, agregarlo **al final** de la rutina de la sesión, con las series completadas como objetivos (mismo criterio que `apply_to_routine`).
- **Exactamente una vez**, dentro de la misma transacción e idempotencia del cierre.
- Subir la versión de la plantilla para que los editores abiertos detecten el cambio (CAS).
- Si el ejercicio ya está en la rutina, la rutina fue archivada o borrada, o no hay series completadas: no agregar, y que el resumen de cierre lo pueda informar sin error.
- Revisá si conviene reutilizar el campo `apply_to_routine` para los agregados o si hace falta uno nuevo. Hoy el guardado podría estar forzándolo a false para ellos; verificalo.
- **Rollout:** EXPAND → ADOPT. La app vieja no tiene que romperse. Tests de cierre: con y sin la opción, duplicado, rutina archivada, reintento idempotente del cierre y conflicto con un editor abierto.
- **No apliques la migración a la base remota sin mi OK explícito.**

## Paso 4 · Backend + Mobile: historial filtrado por rutina (láminas 05 y 06)

**Hoy:** las entradas del historial completo de un ejercicio (`/history/exercises/{id}`) traen `routineName` pero no `routineId`, y el parser Mobile exige exactamente esas claves.

**Orden:**
1. Primero el parser Mobile tiene que tolerar el campo nuevo.
2. Después el servidor agrega `routineId` a cada entrada y un filtro opcional por rutina, donde `latest`, `best` y la paginación se calculen **en el servidor para ese filtro**. "Mejor en PUSH" tiene que ser verdad, no "lo mejor de lo cargado".

**Pantalla del historial completo:** su diseño final está en `bocetos/historial/04-historial-de-un-ejercicio.png` y su prompt (`bocetos/historial/PROMPT-codex.md`). La lámina 05 de esta carpeta es una versión anterior. Este paso aporta el dato (`routineId` y el filtro del servidor) que esa pantalla y el historial rápido necesitan.

**Si con 6 sesiones el filtro del historial rápido queda pobre,** proponé ampliarlo en este mismo paso (por ejemplo, historial rápido por rutina).

## Reglas
- Antes de implementar cada paso, presentá el plan con alcance, riesgos y archivos, y esperá mi OK. Un PR por paso, salvo que veas una razón real para juntar o separar distinto.
- Identidad desde el bearer token, ownership/RLS, nada de service_role en caminos de cliente, sin reintento ciego de escrituras sensibles, idempotencia donde el resultado pueda ser ambiguo, server truth en conflicto.
- Marca: un solo acento; rojo solo para acciones destructivas y errores del sistema; vidrio solo en controles (aviso, barra y hojas); cifras tabulares; voseo; avisos sin exclamaciones. Haptics según la tabla de la marca (C12).
- Respetar "Reducir movimiento" y probar en claro y oscuro. QA en Simulator/iPhone con una sesión real.
- Tests del encabezado: se esconde al bajar, vuelve apenas subís, nunca se esconde con VoiceOver, "Reducir movimiento" ni con una hoja abierta, y el tiempo siempre visible.
- Validar con `npm run validate` en apps/mobile, y para backend los tests de raíz y de supabase.
- No commitear, pushear ni abrir PR hasta que lo pida.
