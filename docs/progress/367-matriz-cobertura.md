# #367 — Matriz de cobertura de Insights

Estado al 2026-11-06, con la captura de configuración en #394 y #395, sin aplicar ni mergear. Contrasta lo que hace el motor con el objetivo de producto. **Cada fila se apoya en código leído, no en que exista una tabla o una pantalla.**

**Código de referencia** (`src/lib/progress/insights-engine/`, salvo que se indique otra ruta):
- `exposures.ts`: `buildExposureContext`, `buildExposureTable`, `mealCandidate`;
- `source-adapter.ts`: `toPerformanceSessions`, `mealTimeEvidence`, `parseSessionFeelings`;
- `read-model.ts`: `createInsightsSnapshot`;
- comparador: `src/lib/progress/performance-insights/comparator.ts` y `exposure.ts`;
- loader: `src/lib/mobile-api/performance-insights-server.ts`;
- pantalla: `apps/mobile/src/insights/` (`insights-screen.tsx`, `insights-model.ts`).

## Cómo leer la matriz

**Resultado.** Lo que se cruza es un **resultado por día**: la proporción de exposiciones comparables con registro inferior a su referencia.
- Carril estricto: `candidateDeclineProportion`.
- Carril parcial: `candidateLowerProportion`.
- Sensibilidad: el mismo resultado con igual peso por sesión (`equalSessionWeightSensitivity`).

**Unidad.** La exposición es un ejercicio de una sesión. La fila de asociación es un día lógico con resultado comparable. El día de hoy queda afuera porque sigue abierto (`day_still_open`).

**Estados posibles:**
- **Accesible:** implementado y visible en Insights.
- **No expuesto:** implementado, pero la pantalla no lo muestra o el motor no lo usa como candidato.
- **Pendiente:** no implementado.
- **Limitado:** existe, pero falta un dato o una decisión para que signifique lo que pide el producto.

**Separación del producto:**
- **Hechos:** lo registrado, con su procedencia.
- **Comparación:** contra la referencia anterior compatible.
- **Coincidencias:** asociaciones entre días.
- **Incertidumbre:** exclusiones, cobertura y método.

**Ninguna fila es una causa.** «Consistente» sigue deshabilitado y el objetivo de riesgo del 1 % sigue sin aprobar.

## Matriz

### Entrenamiento

**Carga y repeticiones**
- **Fuente:** `workout_sets.actual_reps` y `actual_weight_kg` completadas, con `weight_mode_snapshot` e `implement_snapshot`.
- **Unidad y tiempo:** ejercicio de sesión, comparado con la última sesión compatible anterior.
- **Cruce:** es el resultado.
- **Estado: accesible.**
  - Estricto: requiere configuración conocida; ver «Configuración del ejercicio».
  - Parcial: con configuración desconocida.
  - La evidencia es directa: reps a la misma carga y carga a las mismas reps (`directEvidence`).
  - Menos carga con más reps no se ancla y da `ambiguous_evidence`, nunca un descenso.
  - El volumen se informa (`volumeFact`) pero no decide el estado.

**Otros modos**
- **Fuente:** el mismo, por estrategia de `weightModeStrategy` (`src/lib/mobile-api/weight-modes.ts`):
  - kg: peso total, por mancuerna, por brazo, total con barra;
  - lingotes;
  - peso corporal (reps);
  - tiempo (segundos).
- **Unidad y tiempo:** igual que carga y repeticiones.
- **Cruce:** es el resultado.
- **Estado: accesible** para esos cuatro.
  - Peso corporal y tiempo comparan el máximo de la sesión.
  - Cualquier otro modo da `unsupported_mode`.
  - Una carga agregada en peso corporal invalida la serie: no se convierte.

**Configuración del ejercicio (agarre, banco, posición)**
- **Fuente:** `workout_session_exercise_configurations`, nueva.
- **Unidad y tiempo:** ejercicio de sesión, registrada para esa sesión.
- **Cruce:** decide qué exposiciones son comparables.
- **Estado: implementado y verificado en local, sin migración aplicada ni build** (ver «Captura» abajo).
  - El historial queda desconocido y sigue en el carril parcial.
  - Dos configuraciones conocidas distintas no se comparan.
  - La fase dice si se registró durante la sesión o después; el comparador usa las dos y no afirma cuándo se capturó.
  - Dos bloques distintos en la misma sesión dan `mixed_context`.

**Entrenamiento frente a sus referencias anteriores**
- **Fuente:** el comparador.
- **Unidad y tiempo:** ejercicio de sesión; la referencia es la última exposición compatible que terminó antes.
- **Cruce:** es el resultado; los récords salen del historial compatible.
- **Estado: accesible.**
  - La pantalla muestra estado, motivo y antigüedad de la referencia.
  - Los motivos de exclusión tienen texto propio: `missing_context`, `different_context`, `mixed_context`, `no_compatible_reference`.

**Varias sesiones en un día**
- **Fuente:** sesiones con el mismo `day_logs.log_date`.
- **Unidad y tiempo:** día.
- **Cruce:** el resultado diario suma todas; la sensibilidad da igual peso a cada sesión.
- **Estado: accesible como resultado, limitado como contexto.**
  - Sensaciones y ventanas de comida se excluyen del día con `multiple_sessions_day`.
  - El contexto del día en pantalla toma la primera sesión (`contextRows(day, metrics)` sin sesión).

### Sensaciones

**Energía previa**
- **Fuente:** `workout_session_feelings.facts.energyPre`, escala 1–5, con `capturedAt` del reloj del cliente.
- **Unidad y tiempo:** sesión. Solo cuenta si se registró antes del inicio o antes de la primera serie completada (`before_start`, `before_first_set`).
- **Cruce:** antecedente del resultado del día.
- **Estado: accesible**, en días de una sola sesión.
  - Captura desconocida: `feeling_capture_unknown`.
  - Captura después de la primera serie: `feeling_after_first_set`.
  - El reloj no está verificado (`declared_pre_unverified_clock`).

**Energía posterior**
- **Fuente:** `energyPost`.
- **Unidad y tiempo:** sesión, declarada al terminar.
- **Cruce:** ninguno.
- **Estado: no expuesto como resultado.**
  - Se guarda y la pantalla la muestra como contexto del día.
  - No es candidato ni resultado: usarla como antecedente invertiría el orden temporal.

**Fatiga previa**
- **Fuente:** `fatiguePre`.
- **Unidad, tiempo y cruce:** igual que la energía previa.
- **Estado: accesible**, con los mismos límites.

**Fatiga posterior**
- **Fuente:** `fatiguePost`.
- **Unidad y tiempo:** sesión, al terminar.
- **Cruce:** ninguno.
- **Estado: no expuesto como resultado.** Igual que la energía posterior.

**Energía anterior a #383** (`energy_level`)
- **Fuente:** `workout_sessions.energy_level`.
- **Unidad y tiempo:** sesión, sin momento declarado.
- **Cruce:** ninguno.
- **Estado: no expuesto.**
  - Viaja en `legacy` del día, pero la pantalla no lo muestra.
  - No se identifica con `energyPost`.

### Métricas diarias y cuerpo

**Sueño**
- **Fuente:** `daily_metric_values` de la métrica `sleep`, en minutos (`src/lib/daily-metrics/core.ts`).
- **Unidad:** día lógico de la métrica.
- **Tiempo:** dos candidatos por métrica.
  - `same_day`: la misma fecha, sin orden respecto de la sesión.
  - `previous_day`: la fecha anterior.
- **Cruce:** resultado del día.
- **Estado: limitado.**
  - **Nada declara a qué noche corresponde una fecha.** El sueño de la noche anterior al entrenamiento puede estar en `same_day` o en `previous_day` según cómo lo cargue la persona.
  - El motor prueba los dos, lo que suma un candidato a la corrección por multiplicidad.

**Pasos**
- **Fuente:** la métrica `steps` (entero).
- **Unidad:** día.
- **Tiempo:** `same_day`, sin orden, y `previous_day`.
- **Cruce:** resultado del día.
- **Estado: limitado.**
  - Los pasos del mismo día incluyen los posteriores a la sesión: el motor lo declara (`same_day_unordered`), pero el día cuenta como contexto, no como antecedente.
  - **Nada indica si el total del día está completo.** Solo se excluye el día de hoy.

**Peso corporal**
- **Fuente:** ninguna en Insights: el loader no lee tablas de cuerpo.
- **Unidad, tiempo y cruce:** no aplican.
- **Estado: pendiente.**
  - Nunca se confunde con la carga levantada: la carga sale solo de `workout_sets`.
  - Otra superficie de Progreso (Influencias) tiene relaciones con cuerpo; no forma parte de este motor.

**Otras métricas numéricas**
- **Fuente:** todas las de `user_metrics`, por UUID, incluidas las archivadas.
- **Unidad:** día.
- **Tiempo:** `same_day` y `previous_day`.
- **Cruce:** resultado del día.
- **Estado: accesible.** Un valor inválido o sin definición se excluye y se cuenta.

### Alimentación

**Calorías y macros del día**
- **Fuente:** `meal_entries.final_*`, comidas activas y resúmenes diarios heredados.
- **Unidad:** día.
- **Tiempo:** `same_day`, sin orden, y `previous_day`.
- **Cruce:** resultado del día.
- **Estado: accesible como relación, parcial en el contexto.**
  - Un macro faltante excluye el día (`partial_macro`); nunca se vuelve cero.
  - La pantalla del día muestra solo calorías, no proteína, carbohidratos ni grasas.

**Comida antes de entrenar**
- **Fuente:** comidas con hora **explícita** (`mealTimeEvidence` = `explicit`): declarada por la persona (`user_declared`) o importada.
- **Unidad:** sesión, en días de una sola sesión.
- **Tiempo:** dos ventanas.
  - `pre_3h`: las 3 h antes del inicio, con sensibilidad a 2 h y 4 h.
  - `same_day_before_start`.
- **Cruce:** resultado del día.
- **Estado: accesible, solo para carbohidratos.**
  - Una comida sin hora o con hora no verificada dentro de la ventana excluye el día.
  - La hora aproximada de «ahora» queda en una sensibilidad aparte (`with_registration_time`).
  - Sin comida registrada en la ventana: `no_registered_meal_in_window`. **No se interpreta como ayuno.**

**Comida después de entrenar**
- **Fuente:** ninguna separada.
- **Estado: pendiente.**
  - `same_day` mezcla lo anterior y lo posterior a la sesión.
  - No hay ventana posterior ni resultado posterior que tenga sentido cruzar.

## Captura

### Hora de comida desde ChatGPT

**El camino real:**
1. **Contrato:** `parseChatgptMealInput`.
2. **Esquema publicado:** `docs/integrations/ownlevel-chatgpt-action.openapi.yaml` y `registerMealTool`.
3. **Handler:** `callMealRpc`.
4. **RPC:** v4 `user_declared`, v3 `registration_now`, o v2 sin procedencia.
5. **Almacenamiento:** `meal_entries.consumed_at_source`.

**Producción ya publica `time_stated_by_user` en los dos descriptores.** Lo leí sin credenciales.

| Caso | Qué se guarda | Cómo lo lee Insights |
| --- | --- | --- |
| Hora dicha y declarada | `user_declared` | Entra en las ventanas |
| «Ahora», sin hora dicha | `registration_now` | Aproximada: solo en la sensibilidad |
| Hora enviada sin declaración | Sin procedencia | `unverified`: excluye el día de la ventana |
| Comida anterior sin hora | Reloj por defecto | Hora desconocida |
| Momento nombrado (`meal_type`) | Solo si se nombró | No lo usa |

El servidor puede mostrar un momento automático, marcado como automático. **El motor no usa `meal_label`:** nunca infiere desayuno, almuerzo o cena por el reloj.

**Falta el paso manual del dueño en cada conexión instalada:** [chatgpt-nutrition.md](../integrations/chatgpt-nutrition.md#paso-manual-actualizar-las-conexiones-de-chatgpt-367).

### Configuración del ejercicio

Modelo y reglas: [367-exercise-configuration.md](367-exercise-configuration.md). Rollout: [367-exercise-configuration-rollout.md](367-exercise-configuration-rollout.md).

| Dónde | En curso | Completada | Estado |
| --- | --- | --- | --- |
| Mobile | Fila «Variante» en el ejercicio abierto | Sección «Variantes» | Implementado; sin build ni QA física |
| Web | Bajo la nota de cada ejercicio, en el editor de sesión | El mismo bloque en la sesión completada | Implementado; sin deploy |

**Mismo comportamiento en las dos plataformas:**
- el mismo contrato, la misma ruta, el mismo journal y los mismos textos;
- nunca se prellena;
- «Como la última vez» es una elección explícita y guarda su procedencia;
- lo registrado después dice «registrada después»;
- un ejercicio repetido con otra variante en la misma sesión avisa que así no se compara.

**Comprobado en PostgreSQL 17.6 con PostgREST** (`exercise-configuration.local.test.ts`):
- escritura → loader → comparador;
- `mixed_context` con dos bloques;
- invalidación al corregir una sesión completada.

**Qué falta:**
- aplicar la migración, mergear y desplegar;
- build y QA física;
- OBSERVE.

**Hasta entonces, ninguna sesión tiene configuración conocida:** el carril estricto no compara nada y todo queda en el parcial. Después de aplicar, eso solo cambia a medida que la persona registre variantes. Una variante nueva necesita una sesión anterior con la misma para compararse, y la pantalla lo dice.

## Próximos incrementos, separados de esta tanda

**No se implementaron.** Cada uno necesita su propio EXPAND o su propia decisión, y ninguno se mezcla con #394 o #395.

**1. Convención del sueño.** Declarar a qué noche corresponde la fecha. Es el caso con más riesgo de asociación mal fechada.
- **Decisión de producto:** el sueño cargado en la fecha D es la noche que termina la mañana de D, y la captura lo dice («Cuánto dormiste anoche»).
- **Valores nuevos:** quedan marcados con esa convención al guardarse.
- **Valores históricos:** no se reinterpretan. O se excluyen del candidato nuevo, o se informan aparte como «convención no declarada».
- **Candidato:** con convención pasa a `night_before_logical_day` y deja de probarse en dos ventanas, así que hay una hipótesis menos en la corrección.
- **Requiere** un EXPAND en métricas diarias, con procedencia por valor, y su ADOPT.
- **Campaña estadística:** se repite solo si el candidato entra a la misma familia de corrección.

**2. Peso corporal en Insights.** Leer las tablas de cuerpo como contexto diario, nunca como carga.
- **Antes, decidir:**
  - qué medición del día vale si hay varias;
  - cómo se distingue un día sin medición de un valor.
- **Requiere** un candidato nuevo de familia propia, con su lectura en el loader y su costo de páginas.

**3. Todas las sesiones y los cuatro macros en el contexto del día.** Es solo presentación: hoy la vista toma la primera sesión y solo las calorías.
- No cambia el motor ni los denominadores.
- Requiere ajustar `contextRows` y su contrato de vista.

**Después:** decidir si las sensaciones posteriores se publican como un resultado propio, separado del rendimiento.
