Progreso · paso 4: pantalla de un ejercicio (boceto Q6)

Contexto
- Repo OWNLEVEL. Leé AGENTS.md y las partes de docs/brand/ownlevel-marca/IDENTIDAD.md sobre gráficos, colores y tono.
- Plan: bocetos/progreso-v3/PLAN.md (paso 4). Boceto: bocetos/progreso-v2/06-Q6-ejercicio-1rm-estimado.png.
- Pasos 1 a 3 ya están en main (#233–#236). Reusá lo que dejaron:
  - `useProgressRange` y `useComparisonText`;
  - `ProgressScroll`;
  - `arrowDelta` y `formatValue` en progress-format.ts;
  - el estilo de filas planas (`AreaRow` en overview-screen.tsx, `FlatRow` en training-trends-screen.tsx);
  - `SegmentedControl` del design system.
- Rama nueva desde main: `codex/m9-progress-exercise`.

Objetivo
Rehacer `apps/mobile/src/progress/exercise-trends-screen.tsx` con el estilo plano de Progreso:
- sin `Surface` ni tarjetas blancas;
- secciones con `Heading`;
- filas separadas por líneas finas.

Todo se mide dentro del período elegido. La comparación aparece solo con "Comparar" prendido.

1. Encabezado
   - El título grande es el nombre del ejercicio: `ProgressScroll` con `title={data.exercise.name}`, y "Ejercicio" mientras carga.
   - Debajo del bloque de período, en muted: "Espalda · Polea" (músculo · modo de carga).

2. Medidas según el modo de carga (`trainingPerformanceStrategy`)
   - `load_reps` (kg): SegmentedControl "1RM estimado / Mejor serie / Volumen".
   - `unit_reps` (lingotes): "Mejor serie / Volumen" (volumen en "lingotes × reps"). Sin 1RM: un 1RM en lingotes no significa nada.
   - `bodyweight_reps`: "Mejor serie / Repeticiones totales".
   - `time`: "Mejor tiempo / Tiempo total".
   - `unsupported`: sin gráfico. Se mantiene el texto actual ("Este modo de carga no tiene una métrica de rendimiento comparable…").
   - El segmento elegido por defecto es el primero.

3. Número principal y gráfico
   - Número grande con cifras tabulares: el valor de la ÚLTIMA sesión del período en la medida elegida ("78 kg").
   - En 1RM, al lado, un chip "estimado" (fondo `brandSubtle`, texto `primary`, como el boceto). El chip va SIEMPRE que se muestre un 1RM: número, gráfico, accessibilityLabel y filas de sesión ("1RM est. 78 kg").
   - Línea muted debajo:
     - 1RM: "1RM estimado de tu mejor serie del 14 oct (60 kg × 10)".
     - Si hay 2 o más sesiones con valor, agregá el cambio entre la primera y la última del período con flecha neutra: "· ↗ 8 kg en octubre". "en octubre" sale de `periodHeading`, como en el paso 3; si no es un mes, "en el período".
     - Comparando, en vez del cambio interno: "· 1–15 sep 72 · ↗ 6", usando la última sesión del período de comparación.
   - Gráfico con un punto por sesión, en orden de fecha:
     - 1RM, Mejor serie y Mejor tiempo: puntos (no barras), ubicados entre el mínimo y el máximo de lo que se ve, como el modo `level` de `mini-chart.tsx`. El último punto va en champagne pleno y los anteriores en champagne suave.
     - Volumen, Repeticiones totales y Tiempo total: barras desde 0.
     - Comparando: los puntos o barras del período de comparación van antes, en gris (como el paso 2), con la misma escala.
     - Las fechas abajo, salteadas si son muchas (igual que el gráfico de Entrenamiento).
     - Tocar un punto abre la sesión (`/(tabs)/train/history/[id]`).
     - Sesión sin valor válido para la medida (por ejemplo, sin series de 1 a 12 reps para el 1RM): sin punto. Es un hueco, nunca un 0.
   - Una sola sesión: el punto y "Una sola sesión: todavía no hay tendencia."

4. Sesiones del período
   - Filas planas, de la más nueva a la más vieja:
     - título: "Mar 14 oct · PULL" (fecha corta con día de la semana · rutina);
     - debajo, en muted, la mejor serie y, si aplica, "· 1RM est. 78 kg". Ejemplo: "60 kg × 10 · 1RM est. 78 kg".
   - Chevron. Abre la sesión.
   - Vacío: "Sin sesiones de este ejercicio en este período."

5. Mejores marcas (todo tu historial)
   - Sección corta con `data.marks`: trofeo champagne, etiqueta, valor y fecha. Ya existe la lógica: solo cambia el estilo.

6. Comparación de rendimiento
   - Solo con "Comparar" prendido: una línea muted con el resultado actual contra el período de comparación ("Frente a 1–15 sep: Mejoró · +4 kg manteniendo 15 reps"), reusando `performance`, `STATUS_LABELS` y `REASON_LABELS`.
   - Sesiones y series comparadas solo con comparación, como hoy.
   - Sin comparar no hay ningún "frente a".

7. Lo que se va
   - Las `Surface`.
   - El texto "Sin estimaciones de 1RM" donde aparezca. Ahora hay 1RM, siempre marcado "estimado".
   - "Abrir historial del ejercicio" pasa a ser una fila plana al final, con chevron.

Servidor: EXPAND de lectura (`charts=1`)
- Parámetro opcional `charts=1` en `GET /api/mobile/v1/progress/training/exercises/[id]`.
  - Validá que valga "1" y rechazá el repetido, como `inPeriod` en `progressTrainingResponse`.
  - Sin el parámetro, la respuesta queda idéntica: los parsers son estrictos.
- Con `charts=1`, agregá la clave de primer nivel:

  ```
  charts: {
    strategy: "load_reps" | "unit_reps" | "bodyweight_reps" | "time" | "unsupported";
    measures: {
      key: "estimated_1rm" | "best_set" | "volume" | "total_reps" | "best_time" | "total_time";
      label: string;              // "1RM estimado", "Mejor serie", ...
      unit: "kg" | "lingotes" | "reps" | "s";
      derived: boolean;           // true solo para estimated_1rm
      points: { date: string; sessionId: string; value: number; best: { reps: number; weightKg: number | null } | null }[];
      reference: same shape[] | null;   // solo si viene compareFrom/compareTo
    }[]
  }
  ```

- Construcción:
  - Usá `selected.currentSessions` y `selected.referenceSessions` que ya arma `trainingExerciseDto` (`src/lib/mobile-api/progress-training.ts`). No hagas otra lectura.
  - Mismas series válidas que el gráfico actual: `is_completed`, reps > 0, peso > 0 cuando la medida usa peso.
  - `best_set`: la regla del gráfico actual (mayor peso y, a igualdad, más reps; o más reps en peso corporal).
  - `estimated_1rm`, solo para `load_reps`:
    - Epley `peso × (1 + reps / 30)`, redondeado a 0,5 kg;
    - solo con series de 1 a 12 reps (más allá la fórmula no es confiable);
    - por sesión, el máximo de sus series válidas;
    - `best` = la serie que lo dio;
    - sesión sin series válidas = sin punto.
  - `volume` = Σ reps × peso (kg o lingotes según el modo); `total_reps` = Σ reps; `total_time` = Σ segundos; `best_time` = mayor tiempo.
    - Mirá cómo el modo `time` guarda el tiempo en el gráfico actual y seguí esa misma regla.
  - `reference` solo cuando la query trae `compare`. Si no, `null`.
- Contrato:
  - tipos y parser en `src/lib/mobile-api/progress-contract.ts`;
  - clave opcional aceptada solo si está presente;
  - validá: fechas dentro del período (o del de comparación en `reference`), orden cronológico, `derived` true solo en `estimated_1rm`, y `estimated_1rm` solo cuando `strategy === "load_reps"`.
- Sin migraciones. Sin `service_role`. Identidad desde el Bearer.
- La app pide `charts=1` en `fetchProgressTrainingExercise`.

Copy (voseo, corto, sin culpa)
- Nunca "tu 1RM" a secas: siempre "1RM estimado" o "1RM est.".
- Sin rojo ni verde. Flechas neutras.
- Sin exclamaciones, salvo un récord real (no hace falta agregar ninguno).

Marca
- Un solo acento champagne (último punto, chip "estimado", trofeos).
- Cifras tabulares.
- Íconos muted en reposo.
- Sin vidrio en filas.
- Radios y espaciado de tokens.

Tests
- Servidor (`src/lib/mobile-api/progress.test.ts`):
  - sin `charts`, sin clave;
  - con `charts=1`, Epley correcto y redondeado (por ejemplo 60 × 10 → 80 kg);
  - una serie de 15 reps no cuenta para el 1RM;
  - `unit_reps` sin 1RM;
  - `reference` solo comparando;
  - `charts=2` y repetido = 400.
- Mobile:
  - actualizá los tests del ejercicio en `training-screens.test.tsx`: segmentos según el modo, chip "estimado" en 1RM, cambio interno sin comparar y referencia comparando, hueco sin punto, filas de sesión con navegación;
  - no agregues tests de más.

Validación
- Desde apps/mobile: `npm run validate`.
- Desde la raíz: `npx tsc --noEmit -p .`, `npx vitest run src/lib/mobile-api` y eslint de los archivos tocados.

Entrega
- Commit, push y PR a main.
- En la descripción del PR:
  - el EXPAND (`charts=1`, sin él la respuesta es igual);
  - el orden de deploy (hasta el deploy, la app nueva recibe 400 contra producción);
  - la regla del 1RM (Epley, 1 a 12 reps, solo kg, siempre "estimado").
- No hagas merge.
