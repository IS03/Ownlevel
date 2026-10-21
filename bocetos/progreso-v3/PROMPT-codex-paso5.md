Progreso · paso 5: Nutrición en Progreso y "Cuándo comés" (bocetos R5 y R6)

Contexto
- Repo OWNLEVEL. Leé AGENTS.md y las partes de docs/brand/ownlevel-marca/IDENTIDAD.md sobre gráficos, colores, íconos y tono (nada de moralizar la comida).
- Plan: bocetos/progreso-v3/PLAN.md (paso 5). Bocetos: bocetos/progreso-v3/05-R5-nutricion-comparando.png y 06-R6-cuando-comes.png.
- Pasos 1 a 4 ya están en main. Reusá lo que dejaron:
  - `useProgressRange`, `useComparisonText` y `periodHeading`;
  - `ProgressScroll`;
  - `arrowDelta` y `formatValue`;
  - las filas planas (`AreaRow`, `FlatRow`);
  - las barras que entran en el ancho con fechas salteadas (gráfico de training-trends-screen.tsx);
  - `SegmentedControl`.
- Rama nueva desde main: `codex/m9-progress-nutrition`.

Objetivo
Una pantalla Nutrición propia de Progreso que reemplaza al "Reporte nutricional" (hoy `/(tabs)/nutrition/reports`, en otra pestaña y con su propio selector de período), más la pantalla "Cuándo comés".
Estilo plano de Progreso:
- sin `Surface` ni tarjetas;
- secciones con `Heading`;
- filas con líneas finas.

A. Pantalla Nutrición (R5): ruta nueva `/(tabs)/progress/trends/nutrition`
1. `ProgressScroll` con `title="Nutrición"`. Usa el período y la comparación compartidos.
2. Dos números grandes lado a lado, con cifras tabulares:
   - "2.556 / kcal por día";
   - "156 g / proteína por día".
   - Comparando, debajo de cada uno: "1–15 sep 2.195 · ↗ 361". Sin comparar no hay ninguna referencia.
3. Gráfico de calorías:
   - Día por día si el período tiene hasta 31 días. Si tiene más, por semana o por mes (`report.evolution`).
   - Barras desde 0 en champagne.
   - Un día sin registro es un hueco (sin barra), nunca un 0.
   - Hoy, si está en curso, en champagne suave.
   - Una línea punteada fina con el objetivo promedio, rotulada "objetivo 2.029", solo si hay objetivo.
   - Comparando: al lado de cada barra, la del mismo día del período de comparación en gris (pares, como el boceto). Si los períodos tienen distinto largo, emparejá por posición y dejá huecos donde falten días.
   - Debajo, una leyenda muted. Comparando: "Champagne = octubre · gris = 1–15 sep · hueco = sin registro". Sin comparar, solo "hueco = sin registro".
   - Tocar un día abre ese día en Nutrición, si hoy ya existe esa navegación desde el reporte.
4. "Detalle", en filas planas, para no perder nada del reporte actual:
   - días con registro ("12 de 15 días");
   - proteína cumplida ("9 de 12 días");
   - balance acumulado;
   - carbohidratos y grasas promedio;
   - lo destacado del reporte (`highlights`).
   - Mirá qué muestra hoy `src/nutrition/report-*` y no dejes afuera ninguna información (paridad de producto). Cambiá la forma, no el contenido.
5. Fila "Cuándo comés": título, el texto principal de B como subtítulo y chevron. Abre B.

Datos de la pantalla A
- Sin cambios de servidor. Usá `fetchNutritionReport` con el rango A (`query` del contexto).
- Comparando, hacé una segunda lectura con el rango B como `{ period: 'custom', from, to }`.
- Cada lectura tiene su propio estado. Si falla B, mostrá A igual y una línea "No pudimos cargar el período de comparación", sin ceros falsos.

B. Pantalla "Cuándo comés" (R6): ruta nueva `/(tabs)/progress/trends/meal-times`
1. `ProgressScroll` con `title="Cuándo comés"`.
2. Franjas (horario de Córdoba, `America/Argentina/Cordoba`):
   - Mañana 5–11;
   - Mediodía 11–15;
   - Tarde 15–20;
   - Noche 20–5 (incluye la madrugada; rotulala "20–5").
3. Texto principal grande, con el ícono de la franja con más calorías: "De 20 a 5 h comés el 41 % de tus calorías y el 18 % de tu proteína."
   - Debajo, en muted, la franja con menos: "Al mediodía, el 12 % de tus calorías."
   - Tono neutro: describe, no juzga. Nada de "comés mucho de noche" ni consejos.
4. Una fila plana por franja:
   - ícono, nombre y horario;
   - a la derecha "22 % · 30 %" (calorías · proteína);
   - dos barras finas: champagne = calorías, oscuro (`text` al 70 %) = proteína.
   - Comparando, una línea muted debajo: "1–15 sep: 35 % · 28 %".
5. Pie muted: "Champagne = calorías · oscuro = proteína · 86 de 92 comidas con hora".
6. Pocos datos: con menos de 10 comidas con hora en el período, no muestres porcentajes. Mostrá "Todavía hay pocas comidas con hora para ver un patrón (N)." Es un estado vacío útil y neutro, sin EJEMPLO.
7. Íconos nuevos en el design system: `sunrise`, `sun`, `sunset` (`moon` ya existe).
   - SF: `sunrise`, `sun.max`, `sunset`.
   - Lucide: `Sunrise`, `Sun`, `Sunset`.
   - Actualizá icon-names, icon-lucide y el conteo de icons.test.

Servidor: lectura nueva (EXPAND)
- `GET /api/mobile/v1/progress/nutrition/timing`, con los mismos parámetros y validación que el resto de Progreso (`progressQueryFromParams`, `compareFrom`/`compareTo`).
- Usá `progressReadResponse`: identidad por Bearer, reintento a medianoche y validación del DTO con el parser antes de responder.
- Respuesta:

  ```
  { today, period,
    current: Timing, reference: Timing | null }   // reference solo comparando
  Timing = { meals: number; mealsWithTime: number; kcal: number; proteinG: number;
             bands: { key: "morning"|"midday"|"afternoon"|"night"; kcal: number; proteinG: number;
                      kcalShare: number | null; proteinShare: number | null }[] }   // siempre 4, en orden
  ```

- Reglas:
  - Comidas del período por el `log_date` de su día. Sin borradas. Sin `legacy_daily_summary`.
  - Con hora = `consumed_at` presente y hora conocida. Usá la MISMA regla que `timeKnown` en `src/lib/mobile-api/nutrition-day.ts` (`raw_input.originalTimeKnown !== false`). Sacala a una función compartida en vez de copiarla.
  - La franja sale de la hora local de Córdoba de `consumed_at`.
  - Las comidas sin calorías no suman a kcal. Las comidas sin proteína no suman a proteína.
  - Los porcentajes son sobre el total de las comidas con hora. Si un total es 0, el share es `null`, nunca 0.
- Lectura:
  - Preferí leer `meal_entries` (y `day_logs` para `log_date`) con `context.supabase`, que respeta RLS con el token del usuario, paginando de a 1000 como hace la lectura de métricas.
  - Sin `service_role`.
  - Si las políticas RLS no permiten esa lectura, NO la fuerces. Frená y avisá con BLOCKED, proponiendo un RPC de solo lectura con migración (no la apliques).
- Contrato en `src/lib/mobile-api/progress-contract.ts`, con un parser estricto:
  - 4 franjas en orden;
  - shares entre 0 y 1, o `null` cuando el total es 0;
  - las sumas de kcal y proteína de las franjas igualan el total;
  - `mealsWithTime ≤ meals`.

C. Lo que se mueve
- El resumen (overview-screen.tsx): la fila Nutrición y `destinationRoute` para `nutrition` abren la pantalla nueva. Sacá el caso especial `queryParams` del reporte.
- Buscá TODOS los que abren `/(tabs)/nutrition/reports` (Inicio "Esta semana", el `•••` de Nutrición, el calendario de Nutrición si lo usa, el resumen):
  - el `•••` de Nutrición pierde "Reporte";
  - los demás abren `/(tabs)/progress/trends/nutrition` con params opcionales `from`/`to`. La pantalla nueva los aplica una vez al montar, como período Personalizado (o Semana/Mes si coincide exacto con uno de calendario), y después se comporta igual que el resto.
- La ruta vieja `/(tabs)/nutrition/reports` queda viva por ahora (por links viejos) pero sin entradas. Anotalo en `bocetos/PENDIENTES.md` como CONTRACT pendiente. Ahí también marcá "Reporte nutricional" como HECHO en "Va a Progreso".

Copy (voseo, corto, sin culpa)
- Nada de juicios sobre la comida.
- Números como en pantalla ("2.556", "41 %").
- Errores sin exclamaciones.

Marca
- Un solo acento champagne.
- Cifras tabulares.
- Íconos muted en reposo; el de la franja principal en champagne.
- Sin vidrio en filas.
- Radios y espaciado de tokens.

Tests
- Servidor:
  - una comida de las 0:30 cae en Noche;
  - una de las 4:59 cae en Noche y una de las 5:00 en Mañana;
  - una comida sin hora conocida cuenta en `meals` pero no en las franjas;
  - una comida sin proteína no suma proteína;
  - total 0 da share `null`;
  - `reference` solo comparando;
  - otro usuario no ve nada (RLS o `user_id` del token);
  - parámetros inválidos = 400.
- Mobile:
  - Nutrición sin y con comparación (pares, hueco = sin registro, error de B sin romper A);
  - "Cuándo comés" con pocos datos y con datos;
  - los links que antes abrían el reporte ahora abren la pantalla nueva con su rango.
  - No agregues tests de más.

Validación
- Desde apps/mobile: `npm run validate`.
- Desde la raíz: `npx tsc --noEmit -p .`, `npx vitest run src/lib/mobile-api` y eslint de los archivos tocados.

Entrega
- Commit, push y PR a main.
- En la descripción del PR:
  - el endpoint nuevo (EXPAND, no cambia nada existente);
  - que el reporte viejo queda sin entradas;
  - el orden de deploy;
  - si hizo falta una migración, decilo arriba de todo: hay que aplicarla antes del merge.
- No hagas merge.
