# Finalizar entrenamiento (Mobile): rediseño completo

Este trabajo lo hacés de punta a punta, sin pedir OK en el medio: planificás, implementás el servidor (EXPAND) y Mobile, validás, probás en el Simulator, hacés commit, push y abrís el PR listo para revisión (no borrador). El merge lo hace el usuario. Si algo es realmente ambiguo, elegí la opción más segura para los datos, anotala en la descripción del PR y seguí.

Antes de empezar, leé:
- `AGENTS.md`;
- `docs/brand/ownlevel-marca/IDENTIDAD.md` (Vidrio, Movimiento, Haptics, Tono, Gráficos);
- `docs/brand/ownlevel-marca/tema/tokens.ts`;
- `docs/mobile/m9-brand-polish-plan.md`.

Es M9 dentro de la sesión en curso (zona protegida M3.3): no cambies la semántica de finalizar, del autosave, del CAS ni de la idempotencia. Solo cambian la presentación, la animación y una lectura nueva.

## Bocetos (fuente visual)

Carpeta: `bocetos/finalizar/` (PNG exportados de Pencil; el `.pen` es `bocetos/bocetos.entrenar.pen`, fila "F"). Cada lámina trae una nota arriba con la intención. Los bocetos usan Inter y Lucide; en iOS van la fuente del sistema y SF Symbols. Los nombres y números son de ejemplo.

- `01-terminar-hoja.png` (F1)
- `02-nota-sobre-teclado.png` (F2)
- `03-animacion-guardar.png` (F3)
- `04-entrenamiento-guardado.png` (F4)
- `05-sin-series.png` (F5)

## Archivos de partida

- `apps/mobile/src/training/finish-session-sheet.tsx`: la hoja actual, con `SummaryScale` y la nota.
- `apps/mobile/src/training/summary-slider.tsx`: el slider de dolor actual, que es lento.
- `apps/mobile/src/training/completed-session-view.tsx`: `PostWorkoutSheet`, la hojita "Entrenamiento guardado" que se reemplaza.
- `apps/mobile/src/training/history-session-screen.tsx` y `active-session-screen.tsx`: dónde se muestra el post-entreno y el flujo de cancelar.
- `apps/mobile/src/training/active-session-model.ts`: `SUMMARY_SCALES` y el borrador del resumen.
- `apps/mobile/src/api/active-session.ts`: `finishSession` y `SessionFinishedDto`.
- Servidor:
  - `src/lib/mobile-api/training-session-server.ts`, `training-session.ts`;
  - `src/lib/phase2/training-robust.ts`, `training-history.ts`.
- Componentes reutilizables:
  - `exercise-segmented(.ios).tsx`: el segmentado nativo de Liquid Glass ya usado en filtros.
  - `GlassSurface`, `RoutineSheetButton`, `exercise-detail-model.ts` (`exerciseSetLabel`, que respeta el modo de peso) y `history-model.ts` (`volumeLabel`, `compactWeekdayDate`).

## Qué construir

### F1 · Hoja "Terminar {RUTINA}"

- Título "Terminar PULL" (o "Terminar entrenamiento" si es libre), con la fecha y la hora de inicio abajo. Cerrar con el botón de vidrio.
- **Lo logrado, pegado al fondo y sin tarjetas:** duración · series completadas / totales · kg de volumen, en una fila con separadores finos y cifras tabulares.
  - El volumen sale de las series completadas de ejercicios en kg (no de tiempo, lingotes ni peso corporal).
  - Si no hay volumen, no se muestra (missing ≠ zero).
- **Energía y Rendimiento:** segmentado nativo de Liquid Glass (Picker segmentado de `@expo/ui` en iOS 26; fallback de marca en Android, iOS anterior y Reducir transparencia).
  - Solo los números 1 a 5, sin "Buena" ni "Normal" en la cabecera; abajo, "Baja" y "Alta" chiquitos en los extremos.
  - Sin respuesta, no hay nada seleccionado. Tocar el valor elegido lo borra (vuelve a `null`, nunca a 0).
  - Haptic de selección al cambiar.
- **Dolor:** slider nativo (`Slider` de `@expo/ui`) con pulgar de vidrio. **Una sola forma de mostrar el valor:** el número va dentro del pulgar y la barra se pinta hasta ahí. No pongas además los numeritos del 0 al 10 abajo.
  - "Sin dolor" es un atajo de vidrio que pone 0.
  - Sin responder (`null`) es distinto de 0. Mantené la forma de borrarlo (por ejemplo, "Quitar", o volver a tocar "Sin dolor").
  - Tiene que ser fluido: el valor se actualiza en el hilo nativo, no en cada render de React.
- **Nota:** una fila "Agregar una nota" que abre F2. Si ya hay nota, la fila muestra el comienzo del texto.
- **Pie fijo:** botón champagne "Guardar entrenamiento" y "Seguir entrenando" como texto.

### F2 · Nota sobre el teclado

Hoja corta propia, apoyada sobre el teclado, con X (descartar) y ✓ (guardar). El texto siempre queda visible: hoy el teclado tapa el campo. El contador va hasta el máximo actual. Guardar vuelve a F1 con la nota en la fila.

### F3 · Animación al guardar (≈1,2 s)

1. El botón se encoge a un círculo champagne con un anillo de progreso mientras el servidor confirma. La hoja no se mueve.
2. Al confirmar, el anillo se completa, aparece el check y suena el haptic de éxito (tabla C12 de la marca).
3. El círculo crece y tiñe la pantalla de champagne mientras la hoja baja.
4. Sobre ese champagne aparece F4 y los números cuentan hacia arriba.

Reglas:
- Si la respuesta es ambigua o falla, el círculo vuelve a ser el botón con el error actual y conserva la misma clave de idempotencia (exactamente como hoy). Nunca muestres F4 sin la confirmación del servidor.
- Con Reducir movimiento: fundido simple, sin crecer ni contar.
- Usá Reanimated en el hilo de UI. Duraciones y resortes de los tokens de movimiento.

### F4 · Entrenamiento guardado (reemplaza `PostWorkoutSheet`)

Pantalla completa sobre el degradado champagne, no una hoja:
- Check grande, "{RUTINA} guardado" y "Mié 14 oct · 14:53–16:09".
- Tres números grandes en fila, sin tarjetas: duración, series y kg de volumen (si existe).
- **Lo destacado:** lista pegada al fondo, con separadores finos y sin tarjetas blancas, en este orden y con un máximo de 4 filas:
  - **Récord** (puede llevar el acento: es un logro real, IDENTIDAD.md): "Jalón neutro · 60 kg × 10".
  - **Mejora contra la última vez:** flecha neutra, nunca verde. Ejemplo: "Remo T · 25 kg × 12 · +2,5 kg que la última vez".
  - **Sumado a la rutina:** sale de `routineAdditions` con `outcome = "added"`.

  Nunca listes empeoramientos (sin culpa). Si no hay nada destacable, la sección no aparece.
- **Cómo te sentiste**, en línea: Energía · Rendimiento · Dolor y la nota entre comillas. Muestra solo lo que se respondió.
- Botones: "Listo" (champagne) vuelve a Entrenar; "Ver sesión" abre la sesión finalizada (HI5, ya existe).
- La pantalla se arma con la respuesta de finalizar más la lectura de destacados. Si esa lectura falla o tarda, F4 igual se muestra sin la sección (empty ≠ unavailable: nada de "sin destacados" si en realidad no se pudo leer). Los destacados pueden aparecer con un fundido cuando llegan.

### F5 · Sin series marcadas

Si no hay ninguna serie completada, la hoja F1 lo dice arriba, en un aviso neutro con el ícono info: "Todavía no marcaste ninguna serie. Marcalas en la sesión para poder guardar."
- El resumen queda atenuado y deshabilitado.
- El botón principal pasa a "← Volver a la sesión" (cierra la hoja).
- Debajo, "Descartar entrenamiento" en rojo, usando el flujo de cancelar que ya existe (misma confirmación nativa).

## Servidor (EXPAND aditivo)

Lo que devuelve hoy finalizar (`SessionFinishedDto`): tiempos, metadata, cantidades y `routineAdditions`. **No trae volumen ni destacados.**

- **No agregues campos a la respuesta de finalizar.** Esa respuesta queda guardada en el ledger de idempotencia y un replay devolvería la forma vieja.
- En su lugar, agregá una lectura nueva, solo de lectura y sin migración si es posible: `GET /api/mobile/v1/training/sessions/{id}/highlights`.
- Calculala con el historial que ya existe (`training-robust` / `training-history`), con ownership por token, igual que las otras lecturas. Respuesta propuesta:
  - `volumeKg: number | null`: series completadas con peso y reps, solo modos en kg.
  - `highlights: Array<{ kind: "record" | "improvement"; exerciseId; name; mark: { weightKg, reps }; weightMode; previous?: { weightKg, reps } }>`.
- **Récord:** la mejor marca de la sesión supera estrictamente la mejor marca previa del ejercicio, con la misma comparación que usa "Mejor marca" en el historial del ejercicio.
  - La primera vez que hacés un ejercicio no es récord.
  - Las sesiones descartadas no cuentan.
- **Mejora:** contra la sesión completada anterior con ese ejercicio. Primero se compara peso y, con el mismo peso, reps. Solo se informan mejoras; si fue récord, no se repite como mejora.
- La sesión tiene que estar `completed` y ser del usuario. Si no, devolvé el error de no encontrada que ya usan las otras lecturas.
- Parser estricto en Mobile, tests del servidor (récord, empate, primera vez, modos de peso, descartadas excluidas, ownership) y tests del parser.
- Si de verdad necesitás una migración:
  - que sea aditiva;
  - validala localmente con el runner de `scripts/testing`;
  - aplicala en el proyecto de Supabase "gym";
  - alineá el nombre del archivo con la versión aplicada;
  - documentalo en el PR.

## Reglas

- Marca:
  - un solo acento (champagne);
  - rojo solo para "Descartar" y errores del sistema;
  - vidrio solo en controles (segmentado, pulgar, "Sin dolor", botones);
  - cifras tabulares, voseo y sin exclamaciones (salvo un logro real como un récord);
  - claro y oscuro.
- Datos fieles: `null` ≠ 0 en energía, rendimiento y dolor; sin volumen falso; F4 nunca antes de la confirmación del servidor.
- Accesibilidad:
  - VoiceOver anuncia los valores elegidos y el guardado;
  - Reducir movimiento y Reducir transparencia tienen alternativa;
  - texto grande sin cortes.
- No toques: la semántica de finalizar o cancelar, los reintentos ni la clave de idempotencia; el historial general (`app/history`); ni la Web.
- Tests:
  - estados de la hoja: null, borrar un valor, "Sin dolor" = 0;
  - F5 deshabilitado y "Volver a la sesión";
  - finalizar ambiguo que no muestra F4;
  - F4 con y sin destacados, y con la lectura fallida;
  - la lectura nueva (servidor y parser).
- Validación:
  - `npm run validate` en `apps/mobile`;
  - `tsc` y los tests de `src/lib/mobile-api` en la raíz;
  - eslint en los archivos tocados.
- QA en el Simulator (iPhone, iOS 26), en claro y oscuro: sesión con series completadas, sin series y con récord. Podés iniciar y finalizar una sesión de prueba, y después descartala desde la sesión finalizada para no ensuciar el historial real.

## Entrega

1. Rama desde `main`, por ejemplo `codex/m9-finish-redesign`.
2. Commits claros y PR listo para revisión contra `main` en `IS03/Ownlevel`. En la descripción: qué cambió, el endpoint nuevo, las decisiones tomadas por tu cuenta, lo que quedó afuera y la evidencia de validación y QA.
3. Actualizá `bocetos/PENDIENTES.md` si algo queda para después.
