# Biblioteca de ejercicios (Mobile) — rediseño

Lee primero AGENTS.md (sección "Identidad de marca"), docs/brand/ownlevel-marca/IDENTIDAD.md, tema/tokens.ts y docs/mobile/m9-brand-polish-plan.md (§9b, §10, §11). Esto es M9.3 · Training fuera de la sesión activa. Es una pasada visual y de interacción, más **una decisión de producto explícita**: el ejercicio deja de tener valores por defecto (ver "Decisión de producto").

**Solo Mobile.** La Web no se toca: se va a rediseñar al final con otro enfoque (planificar y enseñar, no entrenar). La diferencia temporal entre Web y Mobile está aceptada; dejala documentada.

Este trabajo va en paralelo con el rediseño de la biblioteca de rutinas (`bocetos/rutinas-biblioteca/PROMPT-codex.md`) y del editor de rutina (`bocetos/rutina-editor/PROMPT-codex.md`). Reutilizá sus piezas (vidrio, hojas con X/✓, aviso con "Deshacer", colores de rutina, la hoja "Agregar ejercicios" del editor) y no dupliques componentes.

## Bocetos (fuente visual)

Carpeta: `bocetos/biblioteca-ejercicios/` (PNG exportados de Pencil; el `.pen` está en `bocetos/bocetos.entrenar.pen`, encriptado). Cada lámina tiene arriba una nota que explica la intención. Los bocetos usan Inter y Lucide porque Pencil no tiene SF Pro ni SF Symbols: en iOS va la fuente del sistema y SF Symbols. Los nombres de ejercicios, pesos y notas son de ejemplo.

- 01-lista.png
- 02-filtros.png
- 03-ficha-ejercicio.png
- 04-nuevo-editar-ejercicio.png
- 05-menu-nativo-en-el-lugar.png
- 06-catalogo-FUTURO-no-implementar.png: **solo referencia**. Es un catálogo externo de ejercicios que llega más adelante. No lo implementes, pero no tomes decisiones que lo bloqueen: la ficha y las filas tienen que poder sumar una imagen después.

## Archivos de partida

- apps/mobile/src/training/exercise-library-screen.tsx, exercise-filter-modal.tsx, exercise-editor-modal.tsx, exercise-library-model.ts
- apps/mobile/src/api/exercises.ts (catálogo, crear, editar, estado; `routineIds`, `warning`)
- apps/mobile/app/(tabs)/train/exercises.tsx (ruta actual)
- apps/mobile/src/training/exercise-history-screen.tsx y su API (ruta `train/history/exercise/[id]`)
- apps/mobile/src/training/routine-editor-model.ts (`targetsFromCatalog`) y routine-editor-screen.tsx (agregar ejercicio a la rutina)

## Decisión de producto: el ejercicio es solo "qué es"

- El ejercicio describe qué es: nombre, grupo muscular, músculo (opcional), implemento, cómo se anota el peso y notas. Series, reps, peso, RIR y descanso se definen **dentro de cada rutina**.
- Los valores por defecto (`suggestedSets`, `suggestedReps`, `suggestedWeight`, `suggestedRir`, `suggestedRestMinSeconds`, `suggestedRestMaxSeconds`) **dejan de usarse en Mobile**:
  - **Crear o editar ejercicio:** no se muestran ni se editan.
  - **Agregar un ejercicio a una rutina desde Mobile** (editor de rutina, ficha del ejercicio, "Crear '…'"): **siempre arranca vacío**, con 1 serie sin reps, peso ni RIR, sin descanso y "Próxima vez" en mantener. Cambiá `targetsFromCatalog` (o reemplazalo) y sus tests.
- **No se borra nada de la base.** Al crear desde Mobile, mandá esos campos en null. Al editar, **no pises** los valores que ya estén guardados: la Web todavía los usa. Revisá si el PATCH es completo o parcial y elegí lo que los conserve.
- **Fuera de este trabajo (no tocar):**
  - Agregar un ejercicio durante una sesión en curso sigue precargando series desde el servidor (`series_sugeridas`, zona protegida de M3.3). Queda como un paso aparte y chico. Mencionalo en tu resumen.
  - La Web sigue mostrando y usando los valores por defecto hasta su rediseño.

## Qué hay que construir

### 1. Lista (lámina 01)
- Large Title nativo "Ejercicios" con el total en gris (cifras tabulares). Botón volver de vidrio y "+" de vidrio a la derecha (nuevo ejercicio). Fuera el texto "+ Nuevo" y "Buscá y organizá tus ejercicios."
- Buscador nativo ("Buscar ejercicio o músculo"), que sigue buscando también por implemento como hoy. Al lado, el botón de filtros, que muestra cuántos filtros hay activos.
- **Chips de grupo muscular** debajo, de un toque y scrolleables: Todos, Pecho, Espalda, Piernas, Hombros, Bíceps, Tríceps, Abdomen, Cardio y Sin clasificar. Selección múltiple, como el filtro actual; "Todos" limpia.
- **Una sola lista con secciones por grupo muscular** (encabezados fijos al scrollear; título de sección con el conteo en gris), ordenada alfabéticamente adentro. Reemplaza los acordeones. Filas dentro de un grupo (inset grouped), no tarjetas sueltas.
- **Fila:**
  - Nombre e "Implemento · Peso que anotás" en Footnote gris.
  - A la derecha, **puntos con el color de las rutinas** donde está (hasta 3 y "+N"; si la rutina no tiene color, un punto gris). Etiqueta de accesibilidad "En PUSH y PULL".
  - Flecha ›. Tocar abre la ficha (punto 3).
- Deslizar a la izquierda = Archivar, gris, con aviso y "Deshacer". Mantener apretado = menú: Agregar a una rutina, Editar y Archivar.
- Mantener estados de carga, de no disponible (con lectura vieja), vacío real, sin resultados para la búsqueda o los filtros y pull to refresh. empty ≠ unavailable.

### 2. Filtros (lámina 02)
- Hoja chica (no pantalla completa), con "Limpiar" a la izquierda, "Filtros" al centro y X de vidrio a la derecha.
- **Mostrar:** control segmentado Activos / Archivados / Todos.
- **En rutinas:** control segmentado Todos / En alguna / En ninguna.
- **Implemento:** lista con check, selección múltiple. Mostrá todas las opciones que existen hoy (la lámina abrevia con "Otros").
- Botón "Ver N ejercicios" con el conteo real.
- El grupo muscular sale de esta hoja: queda en los chips. Fuera los subtítulos explicativos de cada bloque.

### 3. Ficha del ejercicio (lámina 03), pantalla nueva
- Ruta push nueva bajo `train/exercises`. Large Title con el nombre.
- Chips informativos: grupo, implemento y peso que anotás.
- `•••` de vidrio arriba a la derecha: **Editar** (abre la hoja del punto 4) y **Archivar**, o **Restaurar** si está archivado (aviso con "Deshacer"). Verificá qué pasa con un ejercicio archivado que está en rutinas y ajustá el copy a la verdad.
- **En tus rutinas:**
  - Filas con la tira de color de la rutina, su nombre y "Ejercicio 4 de 8 · 3 series" (si ese dato no está disponible sin otra lectura, mostrá menos; no inventes).
  - Tocar una rutina abre su editor.
  - Abajo, **"Agregar a una rutina"**: hoja con tus rutinas activas, donde las que ya lo tienen aparecen como "Ya está". Agrega el ejercicio vacío (ver "Decisión de producto").
  - **Desde acá no se saca un ejercicio de una rutina:** eso se hace en el editor de la rutina, porque se pierden sus series.
  - Si el camino actual de `routineIds` en la mutación de ejercicio precarga series desde el servidor, no lo uses para agregar: usá la operación de plantilla de la rutina, con su control de versión, o avisame.
- **Última vez:**
  - Fecha y rutina, y sus series ("55 kg × 12") con cifras tabulares, respetando el modo de peso.
  - "Ver historial completo" lleva a `train/history/exercise/[id]`.
  - Estados distintos: cargando, no disponible (con reintentar) y "Todavía no lo hiciste" (vacío real).
- **Notas:** visibles si existen.
- Lo que hoy era "Usado en rutinas" con chips tildables desaparece del editor.

### 4. Nuevo o editar ejercicio (láminas 04 y 05)
- **Una sola hoja**, ajustada al contenido y apoyada sobre el teclado, con X y ✓ de vidrio. El ✓ se habilita con un nombre válido. La X con cambios pregunta antes de descartar.
- **Campos:**
  - Nombre: `TextField` arriba, con foco al crear.
  - Grupo, músculo, implemento y peso que anotás: un grupo de filas.
    - **Grupo muscular**, con "Sin grupo".
    - **Músculo:** opcional, texto (el "músculo específico" de hoy).
    - **Implemento**, con "Sin especificar".
    - **Peso que anotás** (hoy "Registro de carga"), con "Sin especificar".
  - Notas: campo multilínea siempre visible.
- Los valores se eligen con **menús nativos pegados a la fila** (en iOS, `@expo/ui`), sin pasar a otra pantalla.
- Debajo del grupo, una línea que explica el modo de peso elegido. Borradores para verificar contra cómo los usa la sesión y ajustar:
  - Peso total: el peso que marca la máquina o el total que movés.
  - Por mancuerna: el peso de una sola mancuerna.
  - Por brazo: el peso de un solo lado.
  - Total con barra: la barra más los discos.
  - Peso corporal: sin peso agregado.
  - Lingotes (no kg): la cantidad de placas, no kilos.
  - Tiempo (segundos): segundos en lugar de peso.
- **Fuera:** pasos numerados (1–4), subtítulos de cada paso, "Valores por defecto", "Usado en rutinas" / "Agregar a rutina (opcional)", "Opciones avanzadas" y el botón "Archivar ejercicio" (pasa al `•••` de la ficha).
- Mantener: validaciones actuales, idempotencia de creación, manejo de `warning` de la API (por ejemplo, nombre parecido) y errores con el copy de la marca.
- Esta misma hoja la abre "Crear '…'" desde "Agregar ejercicios" del editor de rutina. Al crear desde ahí, el ejercicio queda marcado para agregar.

## Reglas
- Antes de implementar, presentá el plan con alcance, riesgos y archivos, y esperá mi OK. Si ves un corte real de PR (por ejemplo, la lista y los filtros por un lado y la ficha y el formulario por otro), proponelo.
- No tocar: contratos de API, Supabase, la Web, la sesión en curso. Sin backend nuevo. Si algo de lo pedido no se puede sin backend, marcá BLOCKED y proponé el paso EXPAND.
- Preservar: ownership, idempotencia, control de versión donde exista, server truth en conflicto, missing ≠ zero, empty ≠ unavailable.
- Marca: un solo acento; nada de rojo para archivar; vidrio solo en controles (botones de la barra, hojas y aviso), nunca en filas ni tarjetas; cifras tabulares; escala tipográfica, radios y medidas de la marca (zona táctil mínima de 44); voseo; avisos sin exclamaciones. Haptics según la tabla de la marca (C12).
- Respetar "Reducir movimiento" y probar en claro y oscuro. QA visual en Simulator/iPhone.
- Tests: actualizar los de la biblioteca, los filtros y el editor de ejercicio, y sumar: agregar a una rutina arranca vacío, editar no pisa los valores por defecto guardados, chips de selección múltiple, ficha con "Todavía no lo hiciste" vs. no disponible, y agregar a una rutina con conflicto de versión.
- Validar con `npm run validate` en apps/mobile.
- No commitear, pushear ni abrir PR hasta que lo pida.
