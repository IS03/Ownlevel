# Editor de rutina (Mobile) — rediseño

Lee primero AGENTS.md (sección "Identidad de marca"), docs/brand/ownlevel-marca/IDENTIDAD.md, tema/tokens.ts y docs/mobile/m9-brand-polish-plan.md (§9b, §9d, §10, §11). Esto es M9.3 · Training fuera de la sesión activa: es una pasada visual y de interacción. **No cambia la semántica de datos ni los write paths.** Todo lo de acá se resuelve con los endpoints que ya existen (detalle, identidad, plantilla con control de versión y estado).

Este trabajo va en paralelo con el rediseño de la biblioteca de rutinas (`bocetos/rutinas-biblioteca/PROMPT-codex.md`). Tiene que reutilizar sus piezas: la hoja de nombre y color, los 12 colores y Duplicar. Leelo para no duplicar componentes ni decisiones.

## Bocetos (fuente visual)

Carpeta: `bocetos/rutina-editor/` (PNG exportados de Pencil; el `.pen` original está en `bocetos/bocetos.entrenar.pen`, encriptado). Cada lámina tiene arriba una nota que explica la intención. Los bocetos usan Inter y Lucide porque Pencil no tiene SF Pro ni SF Symbols: en iOS va la fuente del sistema y SF Symbols. Los pesos y los nombres de ejercicios de ejemplo son inventados.

- 01-editor-arriba.png
- 02-editor-scrolleado-y-boton-flotante.png
- 03-menu-rutina.png
- 04-mantener-y-arrastrar.png
- 05-deslizar-quitar-y-confirmar.png
- 06-hoja-ejercicio.png
- 07-descanso-ruedas.png
- 08-agregar-ejercicios.png
- 09-hoja-nombre-y-color.png
- 10-donde-va-agregar-USAR-LA-1.png: usar la opción 1 más el botón flotante de la lámina 02.

## Archivos de partida

- apps/mobile/src/training/routine-editor-screen.tsx (pantalla, IdentityModal, ExercisePicker, TargetsEditor)
- apps/mobile/src/training/routine-editor-model.ts (drafts, `addSet`, `toggleAdjustment`, `targetsFromDraft`, payload de la plantilla)
- apps/mobile/src/training/exercise-library-model.ts (`parseRest`/`formatRest`)
- apps/mobile/src/api/routine-editor.ts (`fetchRoutineDetail`, `updateRoutineIdentity` con `expectedUpdatedAt`, `replaceRoutineTemplate` con `expectedTemplateVersion`)
- Referencias visuales y de patrones: la sesión en curso (`active-session-exercise-card.tsx`, `session-next-options(.ios).tsx`), `start-confirm`, `use-session-starter.tsx`, `exercise-history-screen.tsx` (ruta `train/history/exercise/[id]`), `exercise-editor-modal.tsx`

## Qué hay que construir

### 1. Encabezado y título (láminas 01 y 02)
- Large Title nativo con el **nombre de la rutina** ("PUSH"). Al scrollear se achica y pasa a la barra superior, que se vuelve de vidrio. Al volver arriba, regresa a su lugar. Usá el comportamiento nativo (`headerLargeTitle` o equivalente); no armes un encabezado propio que colapse salvo que lo nativo no se pueda, y en ese caso avisame.
- El título chico de la barra va **sin punto de color**.
- Debajo del título, "8 ejercicios · 24 series" en Subheadline gris con cifras tabulares. Si el Large Title nativo no permite poner la tira de color al lado, se puede omitir; avisá qué hiciste.
- Botón volver de vidrio. El botón volver sigue llevando a Rutinas.
- Se mantiene "Iniciar entrenamiento" como botón principal, con el flujo actual (`StartConfirm` y `use-session-starter`).
- Rutina archivada: sin botón de iniciar, con un aviso chico "Rutina archivada" que explique que se restaura desde `•••`.

### 2. Menú `•••` de la rutina (lámina 03)
- Reemplaza la ruedita y la sección "Opciones de rutina" del fondo. Es un botón de vidrio arriba a la derecha que abre un menú nativo con:
  - **Cambiar nombre y color:** abre la misma hoja de nombre y color de la biblioteca (lámina 09), con 12 colores y "Sin color" como opción chica debajo de la paleta. Usa `updateRoutineIdentity` con `expectedUpdatedAt`, como hoy, y conserva `unrecognizedColor`.
  - **Duplicar rutina:** el mismo flujo que en la biblioteca. Depende del endpoint de duplicar de ese trabajo: mientras no exista, el ítem no se muestra.
  - **Archivar rutina** o, si está archivada, **Restaurar**: sin cartel, igual que en la biblioteca, con un aviso flotante y "Deshacer". La pantalla pasa al estado de archivada.

### 3. Lista de ejercicios (lámina 01)
- Sacar "Abrí uno para editarlo", los círculos con número, la tira de color en cada fila, los `•••` y el aviso "Hay cambios sin guardar…".
- Fila: número de orden chico en gris, nombre (Headline), "Pecho · Máquina · Peso total" (grupo muscular · implemento · modo de peso, Footnote gris), **"3 series"** a la derecha en gris con cifras tabulares, y flecha ›. **No resumir reps ni peso**: suelen variar entre series. Mantener "Ejercicio archivado" cuando corresponda.
- Lista plana como la de la sesión en curso, con separadores; nada de tarjetas sueltas por fila.
- Tocar la fila abre la hoja del ejercicio (punto 6).

### 4. Agregar (láminas 01, 02 y 10)
- "+ Agregar" en el encabezado de la sección "Ejercicios", en acento, igual que en la sesión en curso.
- Cuando ese encabezado sale de pantalla, aparece abajo a la derecha, arriba de la barra de pestañas, un **+ de vidrio chico**, con un fundido.
  - Se esconde mientras arrastrás un ejercicio, con el teclado abierto o con una hoja abierta.
  - Desaparece al volver arriba. Nunca tiene que haber dos botones de Agregar visibles a la vez.
  - Usá el vidrio del design system con su fallback sólido.
- Sin ejercicios: el `EmptyState` actual con "Agregar ejercicio".

### 5. Mover y quitar (láminas 04 y 05)
- **Mantener apretado y arrastrar** reordena. Se guarda al soltar con `replaceRoutineTemplate` y `expectedTemplateVersion`.
  - Si hay conflicto (`ROUTINE_TEMPLATE_CHANGED`), manda la versión del servidor, con un aviso, como hoy.
  - Para VoiceOver, acciones accesibles "Mover arriba" y "Mover abajo".
  - Ya están reanimated y gesture-handler: preferí JS. Si necesitás una dependencia nativa nueva, avisá antes.
- **Deslizar a la izquierda** muestra "Quitar" en rojo; acá sí corresponde, porque se pierden los objetivos del ejercicio en la rutina.
  - Al tocar "Quitar" aparece una hoja de acción nativa: "¿Quitar PRESS INCLINADO MANC.?" / "Se pierden sus series y objetivos en esta rutina. El ejercicio sigue en tu biblioteca y tus sesiones anteriores no cambian." / "Quitar de PUSH" (rojo) / "Cancelar".
  - Se guarda con la plantilla, igual que hoy.
- Se elimina la hoja "Mover arriba / Mover abajo / Quitar de la rutina" del `•••` de cada fila.

### 6. Hoja del ejercicio (láminas 06 y 07)
Reemplaza el editor que hoy se expande dentro de la lista. Es una hoja grande con:
- **Arriba:** X y ✓ de vidrio, y en el medio "Historial", que lleva a `train/history/exercise/[id]`. Si hay cambios sin guardar, preguntar antes de salir.
  - El ✓ se habilita solo con cambios y guarda con la plantilla.
  - La X con cambios pregunta antes de descartar (podés reutilizar el copy del Alert actual de cambios sin guardar).
- **Debajo:** nombre del ejercicio (Title 2) y "Pecho · Máquina · Peso total".
- **Series:** la tabla con la misma estética que la sesión en curso: columnas # · KG · REPS · RIR, celdas centradas sobre `elevated`, cifras tabulares y valores grandes.
  - Un valor vacío se ve vacío o con "—" en gris, **nunca 0** (missing ≠ zero).
  - **Borrar una serie = deslizar la fila** (acción roja). No se puede borrar la última: el mínimo es 1 serie y el máximo 50, como valida hoy el modelo.
  - "Agregar serie" sigue copiando los valores de la última, como `addSet`.
- **Descanso:** una fila "Descanso · 2:30 – 3:00". Al tocarla se despliegan **ruedas nativas** de mínimo y máximo (en iOS, el Picker en rueda de `@expo/ui`, como en el calendario de Entrenar; en Android, el equivalente).
  - Pasos de 15 s, de 0:00 a 60:00.
  - El máximo nunca puede quedar por debajo del mínimo.
  - Vacío (sin descanso) se puede elegir y **no es 0:00**.
  - Un valor guardado que no sea múltiplo de 15 s (por ejemplo, 2:20) se tiene que mostrar y conservar tal cual mientras no se toque. No redondear en silencio.
- **Próxima vez:** dos botones que se marcan y desmarcan, "Más peso" y "Más reps", con los mismos nombres que la sesión en curso.
  - Sin marcar = mantener (`toggleAdjustment`).
  - Si el valor guardado es `custom`, mostrar "Ajuste personalizado anterior conservado." como hoy, sin perderlo hasta que se elija otra opción.
  - Pista debajo: "Sin marcar, se mantiene igual. Marcado, en la próxima sesión te aparece 'Subir peso' como recordatorio." Verificá que el texto describa bien lo que pasa; ajustalo para "Más reps".
- **Notas:** campo siempre visible ("Notas: técnica, agarre o posición"), con el límite actual de 1000 caracteres. Desaparece "Opciones avanzadas · Observaciones".
- **Errores de validación:** dentro de la hoja, junto al campo, con el copy de la marca.
- **Al guardar:** cerrar la hoja y mostrar un aviso. Con conflicto o not_found, manda la versión del servidor: avisar que los cambios no se guardaron y recargar.
- Como los cambios ahora viven solo en la hoja, el bloqueo actual ("Guardá los objetivos pendientes antes de cambiar la estructura") debería dejar de hacer falta. Simplificalo si es seguro y explicá cómo queda el manejo de drafts.

### 7. Agregar ejercicios (lámina 08)
- Hoja con un buscador nativo, chips de grupo muscular y una **lista nativa** (filas dentro de un grupo, no tarjetas sueltas).
- **Selección múltiple** con check en acento y un botón fijo abajo, "Agregar 2 ejercicios", que agrega todos en una sola operación de plantilla, en el orden en que se eligieron.
- Los ejercicios que ya están en la rutina se ven apagados con "En la rutina" y no se pueden elegir. Se elimina el texto de arriba "Los ejercicios que ya están en esta rutina no se pueden duplicar".
- Sin resultados: una fila "Crear "…"" que abre el alta de ejercicio que ya existe (`exercise-editor-modal`) y, al crearlo, lo deja marcado. Si eso complica, dejalo para después y avisame.
- Mantener los filtros y reglas actuales: qué ejercicios se pueden agregar, archivados y estados de carga y de no disponible.

## Reglas
- Antes de implementar, presentá el plan con alcance, riesgos y archivos, y esperá mi OK. Si ves un corte real de PR (por ejemplo, la hoja del ejercicio por un lado y la lista, el título y los gestos por otro), proponelo.
- Preservar: control de versión de la plantilla y de la identidad, server truth en conflicto, not_found, aviso de lectura vieja y pull to refresh (que no pise cambios abiertos), idempotencia y confirmación del inicio. missing ≠ zero, empty ≠ unavailable.
- Marca: un solo acento; rojo solo para quitar ejercicio o serie y para errores del sistema; vidrio solo en controles (barra al scrollear, botones de la barra, + flotante, aviso y hojas), nunca en filas ni tarjetas; cifras tabulares; escala tipográfica, radios y medidas de la marca (mínimo 44 de zona táctil); voseo; avisos sin exclamaciones. Haptics solo según la tabla de la marca (C12).
- Respetar "Reducir movimiento" (fundidos) y probar en claro y oscuro. QA visual en Simulator/iPhone.
- Tests: actualizar los de `routine-editor-screen.test.tsx` y `routine-editor-model.test.ts` y sumar casos para las ruedas de descanso (vacío ≠ 0, valores no múltiplos de 15), borrar la última serie, la selección múltiple y el reordenar con conflicto.
- Validar con `npm run validate` en apps/mobile.
- No commitear, pushear ni abrir PR hasta que lo pida.
