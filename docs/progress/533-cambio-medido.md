# #533 · Cambio medido y Relación por rutina (PR 1, servidor y contrato)

Continuación descriptiva de #518. No agrega inferencia: el cierre de #367 sigue vigente, «consistente» sigue deshabilitado y nada de esto se presenta como causa.

## 1. Cambio por ejercicio (`change`)

Se calcula en `comparator.ts` (`changeOf`) a partir de la **misma evidencia directa** que decide `status`, antes de que la salida compacta la descarte. No cambia ninguna clasificación, referencia, exclusión ni la separación entre comparación completa y parcial: el carril parcial lo lleva con su propia lectura (`reading`).

| Estado | Cuándo | `pct` |
|---|---|---|
| `measured` | Hay señales de cantidad con referencia positiva | Promedio de `delta / referencia`, en %, con 4 decimales |
| `not_comparable` | `insufficient_comparison`: sin referencia compatible o exposición excluida. El motivo es el `reason` del ejercicio | `null` |
| `ambiguous` | `ambiguous_evidence`: señales opuestas (también entre reps y carga) o sin anclar | `null` |
| `no_amount_signal` | Solo se movió la carga | `null` |
| `no_positive_reference` | La referencia de cantidad es 0 | `null` |

**Selección de evidencia**
- Cantidad a igual condición: `reps_at_load` (mejor serie de reps con cada peso que aparece en las dos sesiones), `bodyweight_reps` o `time`. La base es la mejor serie por peso, no la suma: una serie de más no cambia el %.
- Ejemplo: con 20 kg, 12 → 13 reps da `8.3333`. Una caída a 0 reps es un −100 % observado. Si no hubo cambio, el resultado es `measured` con `pct: 0`, que no es lo mismo que «sin dato».
- Carga: `load_at_reps` (más o menos peso para las mismas reps) se cuenta aparte en `load: { unit, up, same, down }`. Nunca entra en `pct`. `unit` es `kg`, o `lingote` para el modo «Lingotes (no kg)», que no se muestra como peso. `load` es `null` en peso corporal y en tiempo.
- `shown` (pulido, PR 3): una señal que la fila puede mostrar tal como se registró. Es la del ancla más pesada entre las que entran en `pct` (por ejemplo `{ anchor: 20, from: 12, to: 13 }` = «20 kg · 12 → 13 reps») o, si solo se movió la carga, la de mayor peso actual (`anchor` = reps, `from → to` = peso). En peso corporal y tiempo, `anchor` es `null`. El % sigue saliendo de todas las señales.
- `change` no se publica en los ejercicios `not_comparable`, porque su `status` y su `reason` ya lo dicen. Así el resumen se mantiene dentro del presupuesto.

## 2. Cambio por sesión (`SessionFact.change`, `PartialSessionFact.change`)

Cada carril lleva el suyo (`performance-change.ts`, `sessionChange`):
- `pct`: promedio de los `pct` de los ejercicios **elegibles**, es decir medidos con base de repeticiones (`reps_at_load` o `bodyweight_reps`). El tiempo y la carga no entran.
- `eligible` / `total`: el denominador visible.
- `directions`: cuántos ejercicios elegibles subieron, quedaron iguales o bajaron.
- `load`: cuántos ejercicios tuvieron señal de carga hacia arriba, igual o abajo (un ejercicio cuenta una vez).

## 3. Resultados recientes (`ExerciseSummary.recent`, `PartialExerciseSummary.recent`)

Hasta 10 resultados `measured` del ejercicio, todos con la base (`basis`) del último. Una base distinta es otra medida y no se mezcla. El orden es el de las sesiones publicadas (fecha lógica y, después, id de sesión), de más viejo a más nuevo, y cada ítem lleva su fecha.

`ExerciseSummary.routineIds` (pulido, PR 3): las rutinas en las que se entrenó el ejercicio, por id, una sola vez en la lista estricta, que nombra a todos los ejercicios. Permite filtrar Ejercicios por rutina sin otra lectura. Resumen de 1 año: 115,5 → 123,7 KiB (sin configuración capturada) y 94,7 KiB (con configuración).

## 4. Día lógico anterior (`DayFact.context.previousDay`)

`{ date, nutrition }` del día anterior por calendario: `previousDate` usa aritmética UTC sobre la fecha lógica, así que cruza meses y años. Se usa la misma suma que el día (`nutritionDays`):
- `nutrition: null`: ese día no tiene comidas.
- `missing > 0` en un nutriente: suma parcial.
- `recorded: 0` con `missing: 0`: cero real.

Las métricas del día anterior no se publican en cada día (costaban hasta 24 KiB en el resumen). Relación las lee de `relationContext.previousDayMetrics`.

## 5. Relación por rutina (`view=routine-relation&method=2&routine=<uuid>`)

Se calcula al abrirla, desde el snapshot en caché del método 2 (`readInsightsSnapshot`): no hace consultas propias ni corre en `summary`. Ventana: los últimos 90 días lógicos hasta hoy.

**Regla de grupos** (cada sesión, sumando los dos carriles, que particionan los ejercicios):
- `up` / `same` / `down`: según el signo del `pct` de la sesión, siempre que ninguna señal de carga de la sesión apunte en sentido contrario.
- `mixed`: el `pct` y una señal de carga apuntan en sentidos opuestos, o el `pct` es 0 con ejercicios que subieron y otros que bajaron.
- `load_only`: no se midió ningún cambio de reps, pero sí una señal de carga.
- `not_compared`: no se midió nada.

`mixed`, `load_only` y `not_compared` nunca cuentan como subió, igual o bajó. `counts` suma todas las sesiones. Cada sesión lleva `pct`, `eligible`, `total`, `lanes` (elegibles por carril), `directions`, `load` y `values` (un valor por factor). Las sesiones del mismo día comparten el contexto diario.

**Factores, en orden fijo** (nunca ordenados por la diferencia):
1. `carbs_pre_3h` (g): la ventana de 3 h de `carbsPre3h`.
2. `last_meal_hours` (h): la última comida con hora explícita. No vale si hay comidas sin hora o con hora sin confirmar en la ventana.
3. `calories_day` (kcal): el día de la sesión.
4. `protein_previous_day` (g).
5. `calories_previous_day` (kcal).
6. `sleep_night_before` (unidad de la métrica): solo con la noche declarada. Aparece solo si la cuenta tiene métrica de sueño.
7. `energy_pre` (1-5): con la misma regla que `priorFeelingFact`.
8. `metric_previous_day:<id>`: cada métrica activa del usuario, en su `sort_order` y después por id.

Cada factor devuelve `unit`, `valid` (sesiones con valor), `missing` (motivo → cantidad) y, por grupo `up` / `same` / `down`, `{ valid, median }`. La **mediana solo existe con 3 o más valores válidos** de ese factor en ese grupo; con menos es `null`. El contrato rechaza una mediana con menos de 3 valores.

La lista estadística existente (`view=relations` y el detalle por `association`) no cambia y sigue bajo demanda.

## 6. Compatibilidad y costo

- Todos los campos nuevos son opcionales y aditivos. El parser de la base (`869f240`) acepta el `summary` y los `days` nuevos sin cambios: se verificó en los seis perfiles sintéticos. Un cliente viejo nunca pide `routine-relation`.
- La consulta de métricas suma la columna `sort_order` en la misma lectura. No hay migración ni consulta nueva.
- Endpoint con fixtures (`performance-insights.test.ts`): en frío son 6 lecturas agrupadas + 1 conteo + 2 lecturas del contador; en caliente, 1 lectura del contador para Relación y para el resumen. La identidad sale del token y otra cuenta no reutiliza el snapshot.
- Tamaño, con perfiles sintéticos (`scale-fixture`, sin y con configuración capturada):

| Perfil | Resumen base → nuevo (KiB) | Días base → nuevo (KiB) | Relación (KiB) | Relación (ms por rutina) |
|---|---|---|---|---|
| 1 año | 87,2 → 115,5 · 59,3 → 86,5 | 70,6 → 87,3 · 49,8 → 66,5 | 8,2 | 0,4–0,5 |
| 5 años | 101,8 → 133,8 · 71,3 → 102,0 | 78,7 → 95,5 · 58,0 → 74,7 | 11,6 | 1,0–1,1 |
| 10 años | 133,8 → 176,7 · 92,0 → 132,7 | 99,8 → 119,8 · 72,5 → 92,5 | 15,8 | 1,6–2,2 |

El aumento del resumen se reparte en `change` (unos 14–17 KiB), `recent` (11–23 KiB) y `previousDay` (unos 3 KiB).
