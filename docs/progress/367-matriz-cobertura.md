# #367 — Matriz de cobertura de Insights

Estado al 2026-11-06, verificado con el historial de `main` (`bd5407e`):
- **Mergeados y desplegados:** #393 a #395, y #397 y #398 (sueño y peso). Detalle en [367-sueno-peso.md](367-sueno-peso.md).
- **Mergeados en `main`:**
  - #403 (`8dd3d01`): contexto diario completo;
  - #404 (`236a3e4`): tendencias de peso con Insights;
  - #405 (`9425e62`): pesos en 0 kg e historial de peso;
  - #406 (`f53fae0`): historial de medidas;
  - #407 (`2eb08b1`) y #408 (`03fc8f7`): memoria del motor;
  - #409 (`bd5407e`): lectura en frío.
- **Pendiente en todos:** la parte de Mobile necesita build. La QA física no está aprobada.
- **En revisión:** el resumen factual post-entreno, en `codex/367-post-workout-summary`. Contrasta lo que hace el motor con el objetivo de producto. **Cada fila se apoya en código leído, no en que exista una tabla o una pantalla.**

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
- **Estado: accesible en producción; Mobile pendiente de build** (ver «Captura» abajo).
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
  - **Vista de una sesión** (`codex/367-post-workout-summary`, se abre desde el resumen post-entreno con la sesión de origen):
    - cada método por separado, con sus conteos y su texto. El estricto aparece cuando tiene un ejercicio con configuración conocida, aunque no tenga comparables; la configuración desconocida sola nunca lo abre (#410);
    - «Mezclado» y «Sin comparar» como filas distintas;
    - cada ejercicio comparado nombra la fecha de su referencia compatible (`referenceDate`, campo opcional del contrato).
  - **Resumen post-entreno:** sus marcas («récord», «↗», «=») salen de otra regla: la última vez con el mismo modo de carga, sin implemento ni variante. Se rotulan así y nunca como lecturas de Insights. Al terminar no se lee Insights: se abre con un toque.

**Varias sesiones en un día**
- **Fuente:** sesiones con el mismo `day_logs.log_date`.
- **Unidad y tiempo:** día.
- **Cruce:** el resultado diario suma todas; la sensibilidad da igual peso a cada sesión.
- **Estado: accesible como resultado y como contexto; limitado como asociación.**
  - Sensaciones y ventanas de comida se excluyen del día con `multiple_sessions_day`. Mostrar todas las sesiones no cambia eso.
  - **Contexto en pantalla** (#403): cada sesión con su nombre, horario, sensaciones y carbohidratos de 3 h, y una sola vez lo que es del día.
  - **Orden:** el de inicio solo si todas tienen hora de inicio legible y sin empate. Si no, la pantalla dice que no sabe el orden y no numera.

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
  - Se guarda y la pantalla la muestra como contexto de su sesión, en cada sesión del día.
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

**Cómo se muestran** (#403; formato ordinal en `codex/367-post-workout-summary`)
- **Valores ordinales registrados**, antes → al terminar: «Energía: baja → alta», «Fatiga: moderada → sin registrar». Sin números de la escala, promedios ni puntaje combinado. Igual en Insights y en el resumen post-entreno.
- **Sin registrar, ilegible y tardía son distintas.** Una respuesta mal formada sigue excluida y contada (`feeling_invalid`), y además la sesión la nombra en `context.unreadableFeelings`: se ve «no se pudo leer», nunca «sin registrar».
- **Tardía:** una previa respondida después de empezar, al terminar o en un momento desconocido lo dice debajo de la fila.
  - **En el resumen post-entreno** no se conoce la hora de la primera serie. Solo dice «sin hora de respuesta», «respondida después de iniciar la sesión» o «respondida al terminar», sin decidir si fue antes de la primera serie.
- **Energía heredada** (`workout_sessions.energy_level`): fila propia, «registro anterior», sin momento. Nunca pasa a ser energía posterior.
- **Lectura no disponible:** si falla la lectura, falla la pantalla entera, como antes. No hay un vacío falso por sesión.

**Energía anterior a #383** (`energy_level`)
- **Fuente:** `workout_sessions.energy_level`.
- **Unidad y tiempo:** sesión, sin momento declarado.
- **Cruce:** ninguno.
- **Estado: no expuesto.**
  - Viaja en `legacy` del día, pero la pantalla no lo muestra.
  - No se identifica con `energyPost`.

### Métricas diarias y cuerpo

**Sueño**
- **Fuente:** `daily_metric_values` de la métrica `system_key = 'sleep'`, en minutos. Nunca por su nombre.
- **Unidad:** día lógico de la métrica.
- **Método 1:** sin cambios. Dos candidatos, `same_day` y `previous_day`, con fecha ambigua.
- **Método 2, convención declarada** (`sleep_night_ending_on_date/1`): el valor de la fecha D es la noche que terminó la mañana de D.
  - **Tiempo:** `night_before`, cruzado con el entrenamiento del día D y con ningún otro día.
  - **Cruce:** resultado del día.
  - **Valores sin declarar:** `sleep_undeclared:*:same_day` y `previous_day`, aparte, con su límite visible. Nunca reutilizan una noche declarada.
- **Estado: accesible en producción** (migración `20261106024523`); Mobile pendiente de build.
  - **Historial:** sin backfill. Todo valor anterior queda sin convención.
  - **Clientes viejos:** no declaran, y una edición suya invalida una declaración anterior.

**Pasos**
- **Fuente:** la métrica `steps` (entero).
- **Unidad:** día.
- **Tiempo:** `same_day`, sin orden, y `previous_day`.
- **Cruce:** resultado del día.
- **Estado: limitado.**
  - Los pasos del mismo día incluyen los posteriores a la sesión: el motor lo declara (`same_day_unordered`), pero el día cuenta como contexto, no como antecedente.
  - **Nada indica si el total del día está completo.** Solo se excluye el día de hoy.

**Peso corporal**
- **Fuente:** `day_logs.weight_kg`, el mismo registro de Cuerpo, con un valor por fecha lógica.
- **Unidad:** día. Varias sesiones de un día aportan un solo valor.
- **Tiempo:** `same_day_unordered`. No sabemos si se midió antes o después de entrenar: es contexto del día, no un antecedente.
- **Cruce:** resultado del día, solo con el método 2.
- **Estado: accesible en producción;** Mobile pendiente de build.
  - Sin peso, peso cero e inválido quedan distintos.
  - No se usa una medición futura.
  - Nunca se confunde con la carga levantada.
- **Tendencias descriptivas** (Cuerpo, Mobile): ya existían, y se reutilizan.
  - Último registro con su fecha.
  - Cambio dentro del período desde el primer registro, ahora también con su fecha.
  - Comparación opcional con otro período.
  - Un punto por registro real: sin suavizar ni interpolar. Cada punto abre su día en Historial.
  - Pesajes sospechosos excluidos y contados; pesajes para corregir debajo.
- **Enlace con Insights** (#404):
  - El peso del contexto del día abre Cuerpo en el mes de ese día.
  - «Ver tu peso en Cuerpo» de la relación abre el tramo de sus días, el último año como máximo.
  - Las dos vuelven a Insights con la fecha, la sesión o la relación de origen.
  - Abierto desde Insights, Cuerpo aclara que el peso de un día no dice si te pesaste antes o después de entrenar.
- **Cero:** Web, Mobile e importaciones aceptaban 0 kg (`MIN_WEIGHT_KG = 0`, `allowZero` en el formulario de Mobile).
  - Insights lo trata como inválido. El informe de Cuerpo (`buildBodyProgressReport`) lo cuenta como medición.
  - **Corregido en #405:** queda fuera del gráfico, el cambio y la comparación, contado y conservado en el historial, y se rechazan los 0 kg nuevos.
  - Cuerpo en Mobile lo nombra con su fecha, con un aviso correcto antes y después de esa corrección.
- **Límite de lectura:** `listWeightHistory` ordenaba de más viejo a más nuevo y cortaba en 1000, así que perdía los más recientes. **Corregido en #405:** el informe lee el historial completo por páginas.
- **No incluido:** cambios porcentuales, ventanas móviles y cualquier familia estadística nueva. Nada de eso es necesario para describir la evolución.

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
- **Estado: accesible como relación y como contexto.**
  - Un macro faltante excluye el día (`partial_macro`); nunca se vuelve cero.
  - **Contexto en pantalla** (#403): calorías, proteínas, carbohidratos y grasas, del mismo `NutritionContext` que usa el motor. La pantalla no suma nada.
  - **Estados:** cero conocido; «sin dato» cuando ninguna comida tiene ese macro; «parcial» con cuántas comidas no lo tienen; «sin comidas registradas».
  - **Alcance:** el texto dice que suma lo registrado. No afirma que sea todo lo que se comió ni que haya sido antes de entrenar.

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

## Próximos incrementos

**No se implementaron:**
- decidir si las sensaciones posteriores se publican como un resultado propio, separado del rendimiento;
- paginar por clave los valores diarios, para la latencia de la lectura en frío (ver #409).

**En revisión:** resumen factual post-entreno, en `codex/367-post-workout-summary`.

**Mergeados en `main`:**
- #403: todas las sesiones y los cuatro macros en el contexto del día;
- #404: tendencias de peso enlazadas entre Insights y Cuerpo;
- #405 y #406: pesos en 0 kg e historiales completos de peso y medidas;
- #407 y #408: memoria del motor;
- #409: lectura en frío.

**Hasta acá:** presentación y lectura, sin cambio de método. Mobile sigue necesitando build y QA física, que no está aprobada.
