Progreso · paso 3: pantalla Entrenamiento (boceto Q4)

Contexto
- Repo OWNLEVEL. Leé AGENTS.md y las partes de docs/brand/ownlevel-marca/IDENTIDAD.md sobre gráficos, colores y tono.
- Plan: bocetos/progreso-v3/PLAN.md (paso 3). Boceto: bocetos/progreso-v2/04-Q4-entrenamiento.png.
- Pasos 1 y 2 ya están en main (#233, #234). Usá lo que dejaron:
  - el período y la comparación compartidos (`useProgressRange`, `useComparisonText`);
  - el contenedor `ProgressScroll`;
  - `arrowDelta` en progress-format.ts;
  - el estilo de filas planas de `overview-screen.tsx` (AreaRow: sin tarjetas, líneas finas entre filas).
- Rama nueva desde main: `codex/m9-progress-training`.

Objetivo
Rehacer `apps/mobile/src/progress/training-trends-screen.tsx` con el estilo plano de Progreso:
- sin `Surface` ni tarjetas blancas;
- secciones con `Heading` y filas separadas por líneas finas.

Todo se mide dentro del período elegido. La comparación aparece solo con "Comparar" prendido.

1. Resumen, debajo del bloque de período
   - Sin comparar: "12 días · 14 sesiones · 284 series · 9 h 20 min".
   - Comparando: agregá la referencia a las series con flecha neutra, igual que la fila del resumen: "284 series · 1–15 sep 374 · ↘ 90".
   - La duración incluye descansos. Mantené esa aclaración en una línea muted chica.

2. Gráfico por período
   - Barras de `data.series`, desde 0, en champagne.
   - El último bucket va en champagne pleno si está en curso. Los anteriores van en champagne suave, como el boceto.
   - Arriba de las barras, un `SegmentedControl` del design system: Series / Sesiones / Duración.
   - Etiqueta abajo: la fecha corta de inicio del bucket ("29 sep").
   - Valor arriba de cada barra solo si hay 8 barras o menos. Con más, el valor va solo en el accessibilityLabel de cada barra.
   - Leyenda: "Series por semana" (o día o mes según `period.bucket`). Si el último bucket incluye hoy, sumá "· esta semana en curso".
   - Un bucket en 0 es 0 real (no hubo entrenamiento): línea tenue, no hueco.
   - Tocar una barra de un día con sesiones abre `/history/day/[date]`, como hoy.
   - IMPORTANTE: el boceto dice "Volumen (toneladas)". NO lo hagas. El volumen global mezcla kg, lingotes y peso corporal, y el proyecto ya decidió no mostrarlo (ver `LOAD_KEYS` en `src/lib/mobile-api/progress-training.ts`). Usá series.

3. Desglose
   - `SegmentedControl` Músculo / Rutina / Ejercicio.
   - Lista con etiqueta directa: nombre a la izquierda, barra horizontal proporcional desde 0 en el medio, "96 series" a la derecha (cifras tabulares).
   - La primera barra va en champagne y el resto en champagne suave.
   - Datos:
     - Músculo = `data.muscles`;
     - Rutina = `data.routines`;
     - Ejercicio = `data.exercises` con `sessions > 0`.
     - Las tres ordenadas por series, de mayor a menor.
   - Muestra los primeros 6. Si hay más, un botón de texto "Ver todos (N)" los despliega.
   - En Ejercicio, cada fila abre `/(tabs)/progress/trends/exercise/[id]`. Músculo y Rutina no navegan.
   - Debajo, en muted: sesiones del ítem ("8 sesiones") en Rutina y Ejercicio.

4. "Mejoraron en el período" (EXPAND de servidor, ver abajo)
   - Fila resumen: "9 ejercicios mejoraron en octubre", subtítulo "Entre su primera y su última sesión del período".
     - "en octubre" sale del mismo texto del período; si no es un mes, "en el período".
   - Abajo, la lista de ejercicios con 2 o más sesiones en el período, ordenada: mejoraron, estables, bajaron, sin comparación.
   - Cada fila muestra:
     - nombre;
     - estado (Mejoró / Estable / Bajó / Sin comparación) en texto, sin rojo ni verde (solo el champagne para "Mejoró", como hoy);
     - la señal "primera → última" que devuelve el servidor;
     - chevron, y abre el detalle del ejercicio.
   - Los ejercicios con una sola sesión van al final, agrupados en una línea muted: "Con una sola sesión: A, B, C".
   - Comparando, cada fila suma una segunda línea muted con el resultado contra el período de comparación, que ya existe en `data.exercises[].status` y `signal`. Ejemplo: "Frente a 1–15 sep: Mejoró · …".
   - "Sólo en el período de comparación: …" se mantiene solo con comparación.

5. Récords
   - Lista de `data.personalRecords`: trofeo champagne, nombre y descripción. Abre el detalle del ejercicio.
   - Vacío: "Sin récords nuevos en este período."

6. "Cómo te sentiste"
   - Una fila por `data.feelings`: "Energía 7,2/10", y en muted "9 de 14 sesiones con registro".
   - Si `ratio < 0.5`, agregá "· pocas sesiones con registro".
   - Vacío: "Sin sensaciones registradas en este período."

7. Lo que se va
   - Las secciones "Frecuencia de ejercicios", "Series por grupo muscular", "Uso de rutinas" y "Rendimiento por ejercicio" quedan reemplazadas por los puntos 3 y 4.
   - `TrainingSummaryCard` deja de usarse en esta pantalla. No lo borres si lo usa otra.
   - "Abrir historial de entrenamiento" pasa a ser una fila plana al final, con chevron.

8. Lo destacado del resumen (overview-screen.tsx)
   - Sin comparar, agregá la fila "N ejercicios mejoraron" con el subtítulo "Entre su primera y su última sesión del período". Abre Entrenamiento.
   - Solo si N > 0 y el dato de servidor está disponible.
   - Comparando, se queda la fila actual ("N de M ejercicios mejoraron · Frente a …").

Servidor: EXPAND de lectura "mejoraron dentro del período"
- Parámetro opcional `inPeriod=1` en `GET /api/mobile/v1/progress/training` y en `GET /api/mobile/v1/progress` (overview). Sin él, la respuesta queda idéntica: los parsers son estrictos y clientes viejos no deben romperse.
  - Usá `progressQueryFromParams(params, ["inPeriod"])` y validá que valga "1", como hace `spark` en `progressOverviewResponse`.
- Training con `inPeriod=1` agrega la clave de primer nivel:

  ```
  inPeriod: {
    improved: number; stable: number; declined: number; insufficient: number;
    exercises: { id: string; status: TrainingPerformanceStatus; reason: string;
                 sessions: number; firstDate: string; lastDate: string;
                 signal: TrainingSignal | null }[]
  }
  ```

  - Solo entran ejercicios con 2 o más sesiones en el período.
  - Los de una sola sesión no entran en `exercises`. La app los saca de `data.exercises` con `sessions === 1`.
- Overview con `inPeriod=1` agrega `inPeriod: { improved: number; comparable: number } | null`. Es null si Entrenamiento no está disponible.
  - La app lo pide junto con `spark=1`.
- Cálculo: para cada ejercicio, armá un snapshot de su PRIMERA sesión del período y otro de su ÚLTIMA. Llamá a `compareTrainingExercisePerformance({ primary: última, reference: primera })` de `src/lib/progress/training-performance.ts`.
  - Así se reusan las mismas reglas por modo de carga (load_reps, bodyweight_reps, unit_reps, time, unsupported, modo distinto = sin comparación). No inventes otra lógica.
  - Mirá cómo se arman los `ExerciseSnapshot` en ese archivo y en `src/lib/mobile-api/progress-training.ts` (`loadTrainingContext` ya tiene la lectura de entrenamientos; no hagas otra).
- Contrato:
  - tipos y parsers en `src/lib/mobile-api/progress-contract.ts`;
  - clave opcional aceptada solo si está presente;
  - validá que `improved + stable + declined + insufficient === exercises.length` en training.
- Sin migraciones. Sin `service_role`. Identidad desde el Bearer como el resto.

Copy (voseo, corto, sin culpa)
- Sin entrenamientos en el período: "Sin entrenamientos en este período." Sin ceros falsos en las secciones de abajo.
- Error de lectura: el `UnavailableState` actual. Nunca vacío cuando falló.

Marca
- Un solo acento champagne.
- Cifras con `numeric`/tabulares.
- Íconos muted en reposo.
- Sin vidrio en filas ni secciones.
- Radios y espaciado de tokens.
- Sin emojis.

Historial general (decisión tomada)
- No sumamos el Historial general (`/history`) a Entrenar: Entrenar ya tiene su historial y calendario, y Nutrición el suyo. La ruta `/history/day/[date]` queda como vista de un día para los links de los gráficos.
- En `bocetos/PENDIENTES.md`, reemplazá la sub-línea del "Historial general (`/history`...)" por:
  "Decisión (15/10): no tiene entrada propia. Entrenar y Nutrición tienen su historial y calendario; `/history/day/[date]` se usa como vista de un día desde los gráficos de Progreso."

Tests
- Servidor (`src/lib/mobile-api/progress.test.ts`):
  - sin `inPeriod`, sin clave;
  - con `inPeriod=1`: primera vs última (mejoró, bajó, estable);
  - modo de carga distinto = sin comparación;
  - una sola sesión fuera de `exercises`;
  - `inPeriod=2` y repetido = 400.
- Mobile:
  - actualizá `training-screens.test.tsx` a la pantalla nueva: resumen sin y con comparación, segmentos del gráfico y del desglose, "Ver todos", navegación al ejercicio, lista de mejoraron, sensaciones;
  - ajustá `progress-screens.test.tsx` por la fila nueva de Lo destacado;
  - no agregues tests de más.

Validación
- Desde apps/mobile: `npm run validate`.
- Desde la raíz: `npx tsc --noEmit -p .`, `npx vitest run src/lib/mobile-api` y eslint de los archivos tocados.

Entrega
- Commit, push y PR a main.
- En la descripción del PR:
  - el EXPAND (`inPeriod=1`, sin él la respuesta es igual);
  - el orden de deploy: el servidor va con el PR, y hasta el deploy la app nueva recibe 400 contra producción;
  - la decisión de series en vez de toneladas.
- No hagas merge.
