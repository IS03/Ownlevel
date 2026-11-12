# #367 / #490 — Elegibilidad temporal de las fuentes para preguntas preregistradas

**Estado:** investigación de solo lectura, 12/11/2026, sobre `main 8331359`. Revisé código, migraciones y contratos. No leí
datos personales, no implementé nada y no corrí campañas. La calibración sintética (#489) no se repite: aquí se toma como
dada.

**Pregunta:** ¿podemos demostrar que una exposición fue registrada antes del entrenamiento y que sus ausencias no invalidan
la conclusión?

## Conclusión

1. **Hoy no existe ninguna fuente apta.** Ninguna llega a Insights con una marca de servidor que pruebe que se registró
   antes de la sesión. Donde la marca existe en la base, el lector de Insights no la usa o la descarta.
2. **Dos fuentes son condicionales:** la **sensación previa** (energía y fatiga antes de entrenar) y las **comidas previas**
   con hora declarada o «comiendo ahora». Les falta solo un cambio de lectura, sin migración. Pero la historia útil empieza
   el 04–05/11/2026 y no se puede usar retroactivamente.
3. **El sueño no es demostrable hoy**; solo lo sería con un EXPAND que conserve la versión original. Pasos, agua, mate,
   métricas personalizadas, peso, importaciones e integraciones **no son aptos**.
4. **Ningún timestamp resuelve el sesgo S2.** Una marca de servidor prueba cuándo se registró algo; nunca por qué falta
   cuando falta.
5. **Recomendación:** no construir Seguimientos ahora y conservar #367 descriptivo. No conviene hacer los cambios de lectura
   salvo que Dirección decida construirlo.

## 1. Marcas temporales que existen

Para cada fuente se separan seis cosas:
- **fecha lógica:** el día al que pertenece el dato;
- **hora declarada:** cuándo dice la persona que ocurrió;
- **captura:** cuándo lo anotó;
- **persistencia:** cuándo lo grabó el servidor;
- **modificación:** cuándo cambió por última vez;
- **confiabilidad** de cada una de esas marcas.

**Reglas comunes a todas las tablas**, que conviene tener presentes:
- `created_at` y `updated_at` tienen `default now()`, pero el trigger `set_updated_at` corre **solo antes de UPDATE**
  ([0001.sql:93–118](../../supabase/migrations/0001.sql),
  [20260909155017…:68–70](../../supabase/migrations/20260909155017_configurable_daily_metrics.sql)). En un INSERT, cualquier
  valor enviado se guarda tal cual.
- `meal_entries`, `daily_metric_values` y `workout_sessions` tienen políticas RLS de insert y update para el propio usuario
  ([0001.sql:346–353](../../supabase/migrations/0001.sql),
  [20260909155017…:197–205](../../supabase/migrations/20260909155017_configurable_daily_metrics.sql),
  [20260810112232…:732–743](../../supabase/migrations/20260810112232_training_robust_rebuild.sql)). Con su token, la
  persona puede escribir `created_at` al insertar.
- Los clientes oficiales no lo hacen, pero la base no lo impide. **`created_at` es «hora de servidor por convención», no
  una prueba.**
- `updated_at` es la hora de inicio de la transacción de la **última** edición. No hay historial de versiones en ninguna
  fuente.
- `insights_source_revisions` avanza con cada cambio confirmado en las fuentes de Insights
  ([20261105211040…:1–11, 181–196](../../supabase/migrations/20261105211040_insights_source_revision_expand.sql)). Permite
  detectar **que** algo cambió después de una lectura, no **qué** cambió. Incluye cambios de `day_logs.log_date`: la fecha
  lógica de un día puede moverse.
- **Cuentas:** no existe fusión ni transferencia entre cuentas. Todo cuelga de `user_id` y el borrado de cuenta es en
  cascada. No hay riesgo de mezclar historias.

## 2. Matriz de fuentes

| Fuente | Fecha lógica | Hora declarada | Captura | Persistencia | Modificación | ¿Captura antes de la sesión demostrable? | Cobertura observable | Riesgo S2 / N7 | Costo de volverla comprobable | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| **Sensación previa** (`energyPre`, `fatiguePre`) | sesión | `declaredAt` (cliente) | `capturedAt` (reloj del dispositivo) | **`receivedAt`, reloj del servidor, solo por RPC** | revisión y `receivedAt` nuevo al editar | **Sí, con `receivedAt` frente al inicio de la sesión o la primera serie.** El adaptador hoy usa el reloj del cliente | sesiones completas con o sin valor previo | **Alto:** la exposición *es* el estado previo; saltearla al sentirse mal es S2 | bajo: cambio de lectura | **Condicional** |
| **Comida previa** (`registration_now`, `user_declared`) | `day_logs.log_date` | `consumed_at` | no existe; para «comiendo ahora» coincide con la persistencia | `created_at` (servidor por convención) | `updated_at`; macros y hora editables sin historial | **Sí, si `created_at` y `updated_at` son anteriores al inicio.** El lector no selecciona esas columnas | comidas con procedencia ÷ sesiones; no se sabe si la persona comió | **Alto:** «no comí» y «no anoté» son indistinguibles (N7, S2) | bajo: lectura; endurecimiento opcional | **Condicional** |
| Comida con hora sin procedencia (`null`, `default_clock`) | idem | hora sin intención o reloj | no existe | `created_at` | `updated_at` | No: la hora no prueba nada | — | — | — | **No apta** |
| Comida importada (planilla, ChatGPT, OAuth) | idem | original | no existe | `created_at` de la importación | — | No: se carga después, por diseño | — | — | — | **No apta** |
| **Sueño** (`daily_metric_values`, `system_key = sleep`) | `metric_date` (+ convención de noche) | no existe | no existe | `created_at` del **primer insert** | `updated_at`; sobrescritura sin historial | **No demostrable hoy:** el lector descarta `updated_at`; borrar y volver a cargar regenera `created_at`; las filas migradas tienen el `created_at` de la migración | días con valor ÷ días con sesión | Medio | medio: EXPAND | **No demostrable** |
| Pasos, agua, mate | `metric_date` | — | — | `created_at` | `updated_at` | No: son totales del día, que incluyen la propia sesión | — | — | — | **No apta** |
| Métricas personalizadas | `metric_date` | — | — | `created_at` | `updated_at` | No: no declaran a qué momento del día se refieren | — | — | — | **No apta** |
| Peso corporal (`day_logs.weight_kg`) | `log_date` | — | — | — (el día) | — | No: no tiene marca propia | — | — | — | **No apta** |
| Sensación legada (`workout_sessions.energy_level`) | sesión | — | — | — | — | No | — | — | — | **No apta** |
| Datos automáticos (HealthKit, Health Connect, wearables) | — | — | — | — | — | **No existen en el proyecto** (búsqueda en `src`, `apps/mobile` y `supabase`: sin resultados) | — | — | — | **No existe** |

## 3. Evidencia por fuente

### 3.1 Métricas diarias (sueño, pasos, agua, mate, personalizadas)

**Contrato** ([20260909155017…:45–59](../../supabase/migrations/20260909155017_configurable_daily_metrics.sql)): una fila
por `(user_id, metric_date, metric_id)` con `value`, `created_at` y `updated_at`. No hay hora del evento ni de captura.

**Escritura en Mobile** ([20261004235000…:84–101](../../supabase/migrations/20261004235000_mobile_daily_metrics_integrity.sql)):
- `UPDATE` del valor, con CAS sobre `updated_at`; vaciar el valor hace `DELETE`.
- Solo se rechazan fechas futuras. Cualquier día pasado se puede escribir.

**Escritura en Web** ([src/lib/daily-metrics/server.ts:239–249](../../src/lib/daily-metrics/server.ts)): `upsert` y
`delete` directos sobre la tabla.

**Datos migrados:** el backfill desde `day_logs`
([20260909155017…:330–340](../../supabase/migrations/20260909155017_configurable_daily_metrics.sql)) dejó `created_at` igual
a la hora de la migración, no a la de captura.

**Sueño:** la convención `sleep_night_ending_on_date/1`
([20261106024523…:1–43](../../supabase/migrations/20261106024523_sleep_night_and_body_weight_sources_expand.sql)) declara
**a qué noche** se refiere el valor. No dice **cuándo** se cargó.

**Lector:** [`performance-insights-server.ts:90–91, 117`](../../src/lib/mobile-api/performance-insights-server.ts) lee
`updated_at` para validar la convención y lo descarta al mapear. Por eso
[`types.ts:40`](../../src/lib/progress/insights-engine/types.ts) no lo tiene.

**Clasificación del sueño: no demostrable.** Aun leyendo `created_at`, el valor actual puede ser una corrección posterior a
la sesión, y vaciarlo y volver a cargarlo regenera `created_at`. Haría falta conservar la primera versión confirmada.

**Pasos, agua y mate: no aptos.** Son totales diarios y la sesión forma parte del total.

**Personalizadas: no aptas.** No tienen ningún momento declarado.

### 3.2 Comidas y nutrientes

**Contrato** ([0001.sql:68–87](../../supabase/migrations/0001.sql)):
- `consumed_at` tiene `default now()`;
- `created_at` y `updated_at`;
- borrado lógico con `deleted_at`.

**Procedencia de la hora** ([20261105210605…:22–60](../../supabase/migrations/20261105210605_meal_time_provenance_expand.sql)):
- `consumed_at_source` toma los valores `user_declared`, `registration_now`, `default_clock`, `imported` o `null`.
- Un trigger impide que una sesión declare la procedencia y la anula si cambia la hora.
- Sin backfill: todas las filas anteriores al 05/11/2026 quedan en `null`.
- El ADOPT de clientes está documentado en [367-meal-time-provenance.md](367-meal-time-provenance.md); Mobile ya envía la
  procedencia (`apps/mobile/src/nutrition/meal-form-model.ts:5`).

**Escritura en Web:** insert y update directos ([src/lib/phase1/day-log.ts:171–180, 293–297](../../src/lib/phase1/day-log.ts)).
Ni `created_at` ni `updated_at` se envían, así que los fija la base.

**Integraciones:** ChatGPT y OAuth escriben por RPC
([20260820130000…](../../supabase/migrations/20260820130000_chatgpt_private_meal_api.sql),
[20261007111714…](../../supabase/migrations/20261007111714_ownlevel_oauth_meals.sql)). Las importaciones de planilla van
por `nutrition_import_runs`.

**Lector:** [`performance-insights-server.ts:92–93, 118`](../../src/lib/mobile-api/performance-insights-server.ts)
selecciona `consumed_at` y `consumed_at_source`, **pero no `created_at` ni `updated_at`**.
[`mealTimeEvidence`](../../src/lib/progress/insights-engine/source-adapter.ts) (líneas 55–65) clasifica la hora de
**consumo**, no la de **registro**.

**Qué se podría demostrar:** una comida con `registration_now` o `user_declared`, con `created_at` anterior al inicio de la
sesión y `updated_at` también anterior. Eso prueba que esa fila, con ese contenido, existía antes de entrenar.
- Una edición posterior de las macros mueve `updated_at` y la excluye. Es conservador: se pierde el dato original, pero
  nunca entra uno tardío.
- Una comida importada después queda excluida sola, porque su `created_at` es posterior.

**Límites de esta fuente:**
- `created_at` se puede falsificar al insertar con el propio token.
- No hay historial de versiones.
- Un borrado lógico posterior a la sesión vuelve ausente un dato que existía.

**Clasificación: condicional.**

### 3.3 Sensaciones previas

**Contrato** ([20261104011622…:14–58](../../supabase/migrations/20261104011622_training_feelings_expand.sql)):
- Cada valor guarda `declaredAt` y `capturedAt` (reloj del cliente) y `receivedAt` (reloj del servidor).
- `receivedAt` es `clock_timestamp()` del RPC (líneas 85 y 152–159).
- `authenticated` solo tiene `SELECT` sobre la tabla: **nadie puede escribir `receivedAt` a mano.**

**Cliente:** el journal ([training-feelings-journal.ts:110](../../src/lib/mobile-api/training-feelings-journal.ts)) fija
`capturedAt` con el reloj del dispositivo. Guarda localmente las escrituras pendientes y las reintenta con la misma clave
de idempotencia. Lo usan Mobile y Web.

**Ediciones:** reemplazar un valor genera un `receivedAt` nuevo y una revisión nueva. El valor anterior no se conserva.

**Offline:** `receivedAt` registra cuándo llegó el dato, siempre después de capturarlo. Comparado con el inicio de la
sesión es **conservador**: puede excluir un valor capturado sin red antes de entrenar, pero nunca admite uno tardío.

**Adaptador:** [source-adapter.ts:84–90](../../src/lib/progress/insights-engine/source-adapter.ts) decide el momento con
`capturedAt`, el reloj del cliente, y lo marca `unverified_client_clock`. El dato de servidor viaja en `facts` pero no se
usa.

**Clasificación: condicional, y la más sólida temporalmente.** El riesgo de sesgo es el más alto: la exposición *es* el
estado previo, que es justo lo que modela S2.

### 3.4 Sesiones de entrenamiento (referencia temporal)

**Marcas del servidor:**
- `started_at` lo fija el servidor al pulsar «Empezar»
  ([20261013211730…:160–165](../../supabase/migrations/20261013211730_mobile_exercise_identity_template_start_expand.sql)).
- `ended_at` lo fija el servidor al terminar
  ([20260928140340…:1523](../../supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql)).
- La serie se completa con `coalesce(new.completed_at, now())`
  ([20260810112232…:505](../../supabase/migrations/20260810112232_training_robust_rebuild.sql)). Mobile no envía la hora;
  una escritura directa sí podría hacerlo.

**Riesgos de esta referencia:**
- **El RPC de inicio solo verifica que el día pertenezca al usuario, no que sea hoy** (líneas 125–128). Se puede registrar
  una sesión en un día pasado, y entonces `started_at` es la hora de carga.
- Si la persona entrenó sin la app y la cargó después, `started_at` queda **posterior** al entrenamiento real. Una comida
  registrada entre el entrenamiento real y la carga parecería «previa».
- Las sesiones antiguas tienen `started_at = created_at`, por backfill
  ([20260810112232…:255–262](../../supabase/migrations/20260810112232_training_robust_rebuild.sql)).
- `day_logs.log_date` puede cambiar después.

**Comprobaciones observables, que reducen el riesgo pero no lo eliminan:**
- el día local de `started_at` en Córdoba coincide con `log_date`;
- la duración entre `started_at` y `ended_at` es plausible;
- las series se completaron en el tiempo de forma escalonada y no todas en un mismo minuto, que delataría una carga a
  posteriori.

## 4. Elegibilidad prospectiva

Lo que el sistema **puede verificar** con las fuentes condicionales:

1. **No reutilizar el pasado:** solo cuentan los datos cuyo `receivedAt` o `created_at` sea posterior a la creación de la
   pregunta.
2. **Registro previo:** `receivedAt`, o `created_at` y `updated_at`, anteriores a `started_at`. La primera serie completada
   sirve como respaldo.
3. **Sin reemplazos silenciosos:** cada mirada guarda los ids y el `updated_at` o `receivedAt` de cada fila usada, junto
   con la revisión de fuentes. Un cambio posterior se detecta, y la mirada no se recalcula.
4. **Las correcciones no cuentan como observación original:** una fila con `updated_at` o `receivedAt` posterior al inicio
   de la sesión no es «previa».

**Cobertura que se puede observar** (denominadores):
- sesiones completas en el período;
- sesiones con exposición elegible;
- días con cualquier registro;
- regularidad de registro: días por semana y largo de los huecos;
- proporción de comidas con procedencia;
- tasa de edición posterior a la sesión.

**Indicadores de sensibilidad que sí detectan problemas observables:**
- La diferencia de resultado entre sesiones con y sin exposición (la compuerta existente) detecta en parte el caso N7.
- La caída de cobertura en períodos de peor resultado.
- La exposición elegible concentrada en ciertos días de la semana o rutinas.

**Lo que no se puede identificar con registros observados:**
- si una ausencia significa «no comí» o «no anoté»;
- si anotar o no depende del estado previo de la persona (S2);
- la cobertura real, distinta de la observada.

La calibración lo mostró: la compuerta de ausencia selectiva frenó solo el **5,2 %** de los casos S2. **Ningún umbral sobre
datos observados lo resuelve**, y no propongo uno.

## 5. Respuestas

**A. ¿Existe hoy alguna fuente apta sin cambios de infraestructura?**
**No.** Ninguna fuente llega a Insights con una marca de servidor que pruebe el registro previo a la sesión:
- las comidas pierden `created_at` y `updated_at` en el lector;
- las sensaciones usan el reloj del cliente;
- las métricas no tienen historial y pierden `updated_at`.

**B. ¿Qué fuentes son condicionales y qué les falta?**
- **Sensación previa.** Le falta decidir el momento con `receivedAt` frente a `started_at` o la primera serie, que es un
  cambio de lectura. Historia disponible desde el 04/11/2026.
- **Comida previa con `registration_now` o `user_declared`.** Le falta leer `created_at` y `updated_at` y exigir que ambos
  sean anteriores al inicio, también un cambio de lectura. Historia desde el 05/11/2026, y solo de clientes que ya envían la
  procedencia.
- **Sueño.** No demostrable hoy. Solo sería condicional con un EXPAND: conservar la primera versión confirmada y fijar
  `created_at` en el servidor.

En las tres sigue sin resolverse el sesgo S2.

**C. Cambios mínimos para comprobar la procedencia, y si aportan valor**

| Cambio | Tipo | Costo | Valor |
|---|---|---|---|
| Usar `receivedAt` en el adaptador de sensaciones | lectura, sin GET nuevo | bajo | solo si se construye Seguimientos |
| Seleccionar `created_at` y `updated_at` de comidas; regla de fila sin cambios antes del inicio | lectura, dos columnas en el GET existente | bajo | ídem |
| Trigger que fije `created_at` en el servidor al insertar (`meal_entries`, `daily_metric_values`) | migración chica, sin cambios de RLS | bajo | cierra la falsificación con el propio token; marginal |
| Primera versión confirmada del sueño (`first_recorded_at` o tabla de versiones) | EXPAND, más lectura | medio | bajo: solo sirve para el sueño cargado a mano antes de entrenar |
| Recibos por mirada (ids, revisión y fechas usadas) | tabla nueva | medio | indispensable **solo** si se construye |

**Sin la decisión de construir Seguimientos, ninguno aporta valor hoy.** No recomiendo hacerlos por adelantado.

**D. ¿Qué garantías nunca podremos ofrecer frente a S2?**
- Que la ausencia de la exposición sea independiente del estado previo de la persona.
- Que una ausencia signifique «no ocurrió» y no «no lo anoté».
- Que la tasa de falsos respaldos se mantenga en el 3,5 % cuando registrar depende de cómo llega la persona. En la
  calibración, con ese mecanismo, fue del 9,5 %.

Lo que **sí** se puede comunicar con honestidad:
- «Este resultado supone que anotaste de forma habitual, sin importar cómo te sentías»;
- la regularidad y cobertura observadas;
- que el resultado es una asociación en tus registros y no una causa.

**E. ¿Vale la pena construir una versión opcional y limitada de Seguimientos?**
**No, por ahora.** Conviene conservar #367 descriptivo.
- **Tiempo:** hacen falta ~120 días pareados, unos 12 meses con 3 o más sesiones por semana y buena cobertura. Las fuentes
  condicionales empiezan en noviembre de 2026 y el diseño prohíbe usar el pasado, así que la primera respuesta posible
  llegaría a fines de 2027.
- **Utilidad:** solo detecta efectos fuertes (62–80 % para +20–25 pp). Los moderados casi no aparecen, y con registro
  escaso no hay respuesta.
- **Confiabilidad:** la fuente más sólida temporalmente, la sensación previa, es la más expuesta a S2, y ese sesgo no se
  puede verificar.
- **Costo:** preguntas, recibos por mirada, cambios de lectura, redacción y pantallas, para un beneficio esperado bajo y
  tardío.

**Qué cambiaría esta recomendación:** que una medición agregada y autorizada aparte mostrara que una proporción relevante
de personas registra la sensación previa en más del 80 % de sus sesiones, con 3 o más por semana. Eso no se puede saber
desde el código.

## 6. Prioridades

1. **Ninguna construcción:** Seguimientos no se construye; #367 sigue descriptivo.
2. **Si Dirección quiere mejorar lo que ya existe:** que las vistas descriptivas de sensaciones marquen el momento con
   `receivedAt` del servidor en lugar del reloj del cliente. Es una corrección de calidad del dato, independiente de
   Seguimientos, y debería ir en su propio issue.
3. **Solo si en el futuro se decide construir:** los cambios de lectura de §5.C y los recibos por mirada, nunca un EXPAND
   del sueño como primer paso.
