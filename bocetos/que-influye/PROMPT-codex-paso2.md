Progreso · etapa 3 · paso 2: Qué influye en la app (bocetos T1–T5)

Contexto
- Repo OWNLEVEL. Leé AGENTS.md y las partes de docs/brand/ownlevel-marca/IDENTIDAD.md sobre tono (sin juzgar comida, peso ni entrenamiento), gráficos y colores.
- Plan: bocetos/que-influye/PLAN.md. Bocetos: bocetos/que-influye/01-T1 a 05-T5.
- El paso 1 ya está en main (#245): `GET /api/mobile/v1/progress/influence` y `/influence/suggested`, con contrato y parser en `src/lib/mobile-api/progress-influence-contract.ts`.
- Reusá lo que ya existe en `apps/mobile/src/progress/`:
  - `ProgressScroll`;
  - `useProgressRange` (período y comparación compartidos);
  - `ProgressRow`;
  - `ExploreSheet`, `OptionSheet` y `MeasureSheet`;
  - `formatValue` y `arrowDelta`;
  - `useProgressResource`;
  - `SegmentedControl`;
  - el patrón de `explore-screen.tsx`.
- Rama nueva desde main: `codex/m9-progress-influence-screens`.
- Sin cambios de servidor.
- NO toques `apps/mobile/.env.local`. Si necesitás un servidor local, usá una variable de entorno al lanzar Metro.

1. Cliente API
- Archivo `apps/mobile/src/api/progress-influence.ts`:
  - re-exporta el contrato;
  - `fetchProgressInfluence(client, query, definition, signal, compare)`;
  - `fetchProgressInfluenceSuggested(client, query, signal, compare)`.
- Como en `fetchProgressExplore`, una respuesta de otro período, de otra comparación o de otra definición es inválida y nunca se muestra.

2. T1 · Preguntas (`/(tabs)/progress/influence`)
- `ProgressScroll` con `title="Qué influye"`.
- Debajo del bloque de período: "Preguntas para tus datos" y, en muted, "Comparan días tuyos entre sí. Muestran relaciones, no causas."
- Una fila plana por pregunta de `suggested`, en el orden del servidor, con:
  - ícono muted según la medida que separa: sueño `moon`, carbohidratos y nutrición `nutrition`, entrenamiento `dumbbell`, pasos `footprints`, agua `water`;
  - la pregunta como título, escrita en la app por `key`:
    - `sleep_sets`: "¿Dormir más cambia tus series del día siguiente?";
    - `carbs_sets`: "¿Los carbohidratos del día anterior cambian tus series?";
    - `training_kcal`: "¿Comés distinto los días que entrenás?";
    - `steps_sleep`: "¿Caminar más cambia lo que dormís?";
    - `training_water`: "¿Tomás más agua los días que entrenás?";
  - una línea muted de respuesta corta:
    - si `ok`: "Con 7 h o más: 26 series · el resto: 21". Si el corte es sí/no: "Entrenando: 2.690 kcal · sin entrenar: 2.410";
    - si `insufficient`: "Faltan datos: N de 14 días";
  - chevron. Abre T2 con esa definición.
- Si una pregunta no vino (el usuario no tiene esa métrica activa), no aparece.
- Lista vacía: "Todavía no hay preguntas para tus datos. Podés armar la tuya."
- Abajo, una fila "Armar tu pregunta" en champagne con `plus`. Abre T3.
- Un error de lectura es `UnavailableState` con Reintentar. Nunca se muestra como lista vacía.

3. T2 · Una respuesta (`/(tabs)/progress/influence/answer`, con params `split`, `cut`, `lag`, `outcome`)
- Título grande: la pregunta.
  - Si vino de una pregunta lista, el texto de esa `key` (pasala como param `key`).
  - Si es propia, se arma igual que la frase de T3.
- Debajo, en muted: "<medida que separa> de <ese día | el día anterior | 2 días antes> · <medida que se mira> del día".
- Si `ok`:
  - Frase principal en semibold, en voseo, neutra, usando las etiquetas, unidades y `formatValue` de la respuesta. Ejemplo: "Después de dormir 7 h o más hiciste en promedio 26 series. Los demás días, 21." Para sí/no: "Los días que entrenaste comiste en promedio 2.690 kcal. Los días sin entrenar, 2.410."
  - Si se mira entrenamiento, agregá en muted "sobre días que entrenaste".
  - Debajo, en muted, la diferencia sin juicio: "5 series más · 24 %" o "180 kcal menos". Si `differencePercent` es null, solo la absoluta.
  - Dos barras horizontales desde 0, con la misma escala: grupo alto en champagne y grupo bajo en champagne suave. Cada una con su etiqueta a la izquierda ("7 h o más" / "Menos de 7 h", "Con entrenamiento" / "Sin entrenamiento") y "26 series · 9 días" a la derecha, con cifras tabulares.
- Filas planas debajo:
  - "Evidencia": "Poca", "Moderada" o "Clara", más " · N días con los dos datos". Sin colores; ícono `progress` muted.
  - "Comparando" (solo si Comparar está prendido y `reference` vino): "Frente a <rango>: 24 y 22 series". Si la referencia es `insufficient`: "Frente a <rango>: no alcanza".
  - "Ojo", siempre: "Es una relación, no una causa: otras cosas pudieron cambiar esos días."
- Si `insufficient` (T5): sin promedios ni barras.
  - "Todavía no alcanza" y, en muted, "Hay N días con los dos datos en este período. Hacen falta al menos 14, con 5 en cada grupo, para comparar sin adivinar."
  - Una barra de progreso neutra N/14, más "N de 14 días".
  - Una fila "Probá un período más largo" que cambia el período compartido a "3 meses" (el mismo estado que la barra de período).
  - Si `missing` vino, una fila "<medida> es lo que más falta" sin navegación.
- No hay "Fijar en Mis vistas" todavía: es el paso 3.

4. T3 · Armar tu pregunta (`/(tabs)/progress/influence/build`)
- `ProgressScroll` con `title="Tu pregunta"`.
- Renglones como en Explorar:
  - "Separar días por": medida;
  - "Cómo": corte;
  - "Qué medir": medida.
  - Debajo, un `SegmentedControl` "Mismo día / Día siguiente / 2 días después" para el lag.
- La hoja de medida reusa la de Explorar, filtrando por el catálogo del contrato:
  - para separar: nutrición, entrenamiento, métricas, más "Día de entrenamiento" y "Día laboral" (grupo "Días");
  - para medir: nutrición, entrenamiento, métricas;
  - sin cuerpo ni ejercicios.
  - Si `MeasureSheet` no se puede reusar sin romper Explorar, extraé la parte común. No dupliques la lógica.
- "Tu pregunta", en muted, y la frase armada en semibold. Ejemplo: "¿Los días después de comer más carbohidratos hacés más series?"
  - Si el corte es la mediana, sumá en muted "Se comparan los días por encima y por debajo de tu mediana del período." No la calcules en la app: el valor lo da la respuesta.
- Botón "Ver respuesta": deshabilitado hasta que la definición sea válida, con `validInfluenceDefinition` del contrato. Abre T2.

5. T4 · Cómo separar los días (hoja)
- Si la medida que separa es sí/no (`day.*`): no hay elección. El renglón dice "Sí / no" y no abre hoja.
- Si no, la hoja ofrece:
  - "Arriba / abajo de tu mediana" (por defecto), con detalle "Grupos parejos";
  - "Un corte propio", con un stepper con la unidad de la medida (pasos razonables: 10 g, 50 kcal, 15 min para duración, 1 para enteros) y el valor como "300 g o más".
- Nota muted: "Con menos de 5 días en un grupo no se muestra una respuesta."
- `cut` se manda como `median` o `gte:<número>`.

6. Entradas
- Progreso: debajo de "Lo destacado", una fila "Qué influye" con ícono `sparkles` muted y subtítulo "Preguntas sobre tus días". Abre T1.
- Explorar: al final, una fila "Qué influye en esto" que abre T3 con la medida actual como "Qué medir", si el contrato la admite. Si no la admite, la fila no aparece.

Copy y marca
- Voseo, corto, sin culpa ni consejos.
- Nunca "mejor" o "peor": "más", "menos", "en promedio".
- Exclamaciones nunca.
- Un solo acento champagne.
- Cifras tabulares.
- Sin rojo ni verde.
- Sin vidrio en filas.
- Íconos muted en reposo.

Tests (`apps/mobile/src/progress/influence-screens.test.tsx`)
- T1:
  - lista con una `ok` y una `insufficient`;
  - la pregunta que no vino no aparece;
  - un error no se muestra como vacío.
- T2:
  - frase y barras con `ok`;
  - sí/no;
  - "sobre días que entrenaste";
  - fila "Comparando" solo comparando;
  - `insufficient` sin números y con "Probá un período más largo".
- T3:
  - "Ver respuesta" deshabilitado sin medida;
  - el corte sí/no fijo para `day.training`;
  - `gte:` desde el stepper;
  - navega con los params correctos.
- Entradas desde Progreso y Explorar.
- No agregues tests de más. Ajustá los existentes si una entrada nueva los rompe (por ejemplo, mockeá las lecturas nuevas en `progress-screens.test.tsx`).

Validación
- Desde apps/mobile: `npm run validate`.
- Desde la raíz: `npx tsc --noEmit -p .`.
- Probalo en el Simulator contra producción (el `.env.local` ya apunta a https://www.ownlevel.fit).

Entrega
- Commit, push y PR a main con capturas o la descripción de lo probado.
- No hagas merge.
