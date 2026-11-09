# #367 — Hoja de ruta del ecosistema de Insights

**Objetivo de producto:** relacionar alimentación, horarios, descanso, actividad, sensaciones, rendimiento y evolución corporal, con resúmenes claros y evidencia consultable.

Este documento fija el orden y las reglas de cada fase. **Lo que dice «diseño» no está implementado.** El estado real de cada fila está en la [matriz](367-matriz-cobertura.md).

## Ejecución Mobile autorizada — 7 de noviembre de 2026

[Plan ejecutable y decisiones](367-ecosistema-mobile-ejecucion.md): primero contexto temporal completo por sesión, luego exploración conjunta de semanas y conexiones del período; después #399 y #418 en PRs separados. #421 ya aporta los detalles de período. La rama de contexto temporal prepara una vista descriptiva nueva, sin cambios de Web ni #402.

**Checkpoints preparados:** contexto temporal en #423; semanas/días apilados sobre esa rama, con un único trimestre fijado, evidencia de comparación existente y retornos a la selección. Se completaron las etapas descriptivas 1–3 en código; aceptación física pendiente. Costos, contratos y verificación local en el plan enlazado. No adelantan el estado metodológico de asociaciones ni cierran #367.

Entregas: #423 → #424; #425 (#399) y #426 (#418) independientes sobre main. Una validación Mobile completa dejó un fallo del dock sin causa acreditada; las 69 pruebas relacionadas pasan en main y combinación, por lo que el gate global queda pendiente. Detalle exacto en el checkpoint enlazado. Sin nuevas campañas estadísticas ni aprobación de QA.

#419 está integrado; #420 sigue borrador y separado, y su validación reservada **no acreditó el criterio**. La investigación está detenida: no ejecutar las calibraciones, campañas o potencia descritas como futuro en los diseños históricos de abajo. Asociaciones experimentales y «consistente» permanecen deshabilitadas. Las fases descriptivas no dependen de reabrir esa investigación.

## Reglas comunes

- **Un resultado nuevo es una familia nueva**, con su propia calibración. Nunca hereda la del rendimiento.
- **Primero se fija** la unidad, la elegibilidad, la temporalidad y la dependencia; después se miran resultados.
- **Las ventanas y los umbrales se eligen antes**, con su justificación. No se busca después la ventana que dé el resultado más llamativo. Las alternativas se muestran como sensibilidades, nunca reemplazan a la preregistrada.
- **Datos:**
  - faltante ≠ cero;
  - vacío ≠ no disponible;
  - una comida sin registrar no es ayuno, y un día con comidas no es un día completo.
- **Presentación:** los filtros nunca disparan una búsqueda nueva de patrones. Filtran lo ya evaluado.
- **Frases:** determinísticas, breves y neutrales. «En tus registros, X coincidió con Y.» Con acceso a los días, las fechas, las exclusiones y la incertidumbre. Sin causalidad, rangos óptimos, recomendaciones ni cambios de rutina.
- **«Consistente» sigue deshabilitado.**

## Fase 1 — Energía y fatiga al terminar (esta entrega)

Ver [367-sensaciones-resultado-metodo.md](367-sensaciones-resultado-metodo.md).
- **Publicado:** la descripción (`view=feelings`) y la pantalla «Cómo terminaste».
- **Segundo método experimental** (`codex/367-feeling-stratified`): permutación dentro de rutina × bloque de 42 días, preregistrado y con validación reservada. Reduce los falsos positivos en escenarios de confusión por rutina y tendencia, pero los nulos quedan entre 1,6 % y 4,0 %: tampoco valida.
- **Tercer diseño** (#419, `f32289a`; continuación `codex/367-feeling-sequential-validation`): candidatos anteriores y control de candidatos/resultados/miradas. Una única [validación reservada](367-sensaciones-secuencial-resultados.md), preregistrada: 1.000 historias por nulo, horizontes anidados 24/36 meses; cuatro nulos no acreditan la cota superior propuesta. **Línea detenida**, potencia no ejecutada por la regla previa, sin recalibrar ni publicar asociaciones.
- **Sin publicar ni preparar en las vistas:** las asociaciones. La calibración no alcanza el objetivo de validación propuesto (1 %, no aprobado como tolerancia) con cambios de rutina y tendencias, ni tampoco en los nulos.

## Fase 2 — Alimentación y tiempo

**Estado** (`codex/367-meal-timing`, método y resultados en [367-alimentacion-horaria-metodo.md](367-alimentacion-horaria-metodo.md)):
- los tres valores se publican como contexto de la sesión;
- los tres candidatos **no validaron** con la calibración preregistrada: el exploratorio sube entre 4 y 9 puntos. Quedan fuera de las asociaciones públicas y de su preparación en las vistas.

**Diseño original**, sin cambios:

**Lo que ya existe:**
- totales del día y del día anterior para los cuatro macros, «mismo día, sin orden»;
- carbohidratos con hora explícita en las 3 h antes del inicio (`meal_window:carbsG:pre_3h`), con sensibilidades de 2 h y 4 h, con hora de registro y con hora no verificada;
- carbohidratos del día antes del inicio (`same_day_before_start`);
- **procedencia de la hora:** explícita (declarada o importada), de registro (aproximada), no verificada y desconocida (`mealTimeEvidence`).

**Distinciones que el diseño conserva:**
- **Total del día ≠ consumo demostrablemente previo.** Solo una comida con hora explícita anterior al inicio cuenta como previa. Una comida sin hora en el alcance de la ventana anula la ventana (`untimed_meal_in_scope`); no se reparte ni se adivina.
- **Cantidad, distancia temporal y distribución** son exposiciones distintas. No se combinan en un índice.
- **Medianoche:** las ventanas son instantes, no fechas. Una comida de las 23:00 del día anterior cuenta para un entrenamiento a la 1:00.
- **Varias sesiones en un día:** quedan afuera, como hoy, hasta definir la sesión de referencia del día con su propia regla.

**Conjunto inicial propuesto**, tres candidatos nuevos y nada más:

| Candidato | Qué mide | Por qué este y no otros |
| --- | --- | --- |
| `meal_window:proteinG:pre_3h` | Proteína con hora explícita en las 3 h previas | Misma ventana preregistrada que los carbohidratos, otro macro. Sin ventanas nuevas |
| `meal_window:calories:pre_3h` | Calorías con hora explícita en las 3 h previas | Separa cantidad total de composición sin sumar macros |
| `meal_timing:hours_since_last_explicit:pre_start` | Horas desde la última comida con hora explícita antes del inicio, hasta 12 h | La distancia temporal. Solo cuando no hay comidas sin hora ese día ni el anterior antes del inicio. Si no, «sin dato», nunca «ayuno» |

**Fuera del conjunto inicial:**
- **grasas en ventana:** quedan para después del primer resultado;
- **distribución del día** (parte de lo registrado antes del inicio): depende de que el día esté completo, y eso no se sabe (`ingestionCompleteKnown: false`);
- **ventanas de 1 h o 6 h** como primarias;
- **cualquier combinación de ventana y macro** no listada.

**Validación:**
- recalcular la calibración de las familias afectadas (rendimiento estricto, parcial y, si se publican, sensaciones), con 3 candidatos más por familia;
- el escenario de [tamaño de familia](367-insights-pr4-motor.md) ya mide 12 contra 14 candidatos y se extiende a 17.

## Fase 3 — Evolución corporal

**Estado** (`codex/367-body-weekly`, método, preregistro y resultados en [367-evolucion-corporal-metodo.md](367-evolucion-corporal-metodo.md)):
- «Semana a semana» se publica en Cuerpo, desde la lectura que Cuerpo ya hace;
- el análisis frente a alimentación y actividad de la semana anterior no validó: la compuerta estricta queda por encima del 1 % en los nulos. Queda experimental y sin publicar.

**Diseño original**, sin cambios:

- **Resultado nuevo e independiente:** el cambio de peso corporal.
  - **Unidad:** la semana. Un día no tiene evolución corporal.
  - **Medida:** la diferencia entre la mediana de los pesos de la semana y la de la anterior, con al menos 3 pesos válidos en cada una. Sin interpolar semanas vacías.
  - **Peso válido:** el de Cuerpo, positivo. 0 kg es inválido, nunca «nada».
- **Exposiciones de períodos anteriores:**
  - calorías registradas medias de la semana anterior, con cobertura mínima de días con comidas, y la cobertura a la vista;
  - entrenamientos y series completas de la semana anterior.
  - Nunca la misma semana: el orden temporal se respeta.
- **Contra tendencias espurias:**
  - no se correlacionan dos tendencias;
  - la unidad es el cambio semanal, y se quita la tendencia local;
  - permutaciones por bloques de semanas y la rutina como estrato;
  - su propia calibración, con escenarios de deriva lenta.
- **Alcance de una asociación semanal:** nunca explica una sesión. La frase habla de semanas.

## Fase 4 — Resúmenes de período

**Estado** (`codex/367-period-summary`): «Últimos 3 meses» en Insights. Descripción determinística de los tres meses calendario completos anteriores al mes en curso, sin asociaciones. Detalle en la [matriz](367-matriz-cobertura.md).

**Diseño original**, sin cambios:

- **Períodos fijos:** 3 meses, sin elegir el inicio por el resultado.
- **Qué se muestra:**
  - cobertura por fuente;
  - denominadores en cada número;
  - cambios de rutina marcados en el tiempo;
  - la tendencia temporal de cada resultado, por separado de cualquier asociación.
- **Lo que no es:** una búsqueda nueva. Muestra lo ya evaluado en el período, con sus exclusiones. Un período sin datos suficientes lo dice.

## Orden y dependencias reales

1. **Fase 1:** esta entrega. Descripción publicada; asociaciones a la espera de un método que pase la calibración.
2. **Fase 2:** un PR del motor con su calibración. No depende de la fase 1, salvo para recalibrar las sensaciones si se publican antes.
3. **Fase 3:** un PR del motor. La UI va en su propio PR, porque es una pantalla nueva en Cuerpo.
4. **Fase 4:** depende de las fases 2 y 3 para tener algo que resumir.

Ninguna fase necesita migraciones: todo sale de datos ya registrados.

## Continuidad automática dirigida — diseño separado, sin implementación ni campaña

**Pregunta inicial única:** ¿la proteína *registrada con hora explícita en las 3 h previas* aporta información para anticipar la distribución de energía al terminar, además de cómo empezaste, la rutina y el calendario? Se elige por el objetivo de producto y por disponer de una ventana anterior con procedencia explícita, no por haber mirado correlaciones personales. No se empieza por todos los macros, horarios, métricas y resultados a la vez. El resultado es predictivo/observacional, nunca «la proteína produjo el cambio».

**Límite que resuelve:** las descripciones de #412 y el contraste manual no descubren patrones. #417 no validó su búsqueda estratificada; #419/#420 tampoco acreditaron la cota propuesta en autocorrelación, cambio de rutina, cambio no registrado y temporalidad incierta. Las estimaciones puntuales de #420 no demostraron una tasa superior al 1 %, pero las cotas no permitieron acreditar su objetivo; potencia no se ejecutó. [Resultados históricos intactos](367-sensaciones-secuencial-resultados.md). El diseño nuevo evita buscar simultáneamente familias/resultados y cambiar el método después de mirar una reserva; no reutiliza esas historias como validación nueva ni vuelve a correr sus campañas.

### Presupuesto conjunto y decisión, fijados antes de una reserva futura

Nacho aprobó **como objetivo de investigación** un máximo del **1 % de historiales con alguna falsa alerta durante 24 meses**, evaluado con la **cota superior del intervalo del 95 % en cada escenario nulo preregistrado**. No es garantía sobre datos reales ni autorización para publicar. Se conserva 36 meses, sin truncar una evaluación anterior para conseguir aprobación.

- **Unidad del evento de error:** un historial completo marca 1 si en cualquier mirada se emitiría alguna alerta falsa, aunque se repita o cambie de dirección. No se cuentan alertas individuales como ensayos independientes.
- **Resultado incluido:** solo energía post, distribución ordinal completa de cinco niveles. Fatiga, rendimiento estricto/parcial, peso y otros resultados no generan alertas en este experimento. Las cinco probabilidades no se convierten en cinco tests elegidos después: se evalúa una única predicción conjunta. No se publica un resultado por el nivel que más favorezca la historia.
- **Candidato incluido:** una sola exposición, proteína registrada en `[inicio−3 h, inicio)`, continua, transformación `log1p(g)`. Cero explícito es válido; desconocido no se imputa. Incluye **ambas direcciones** de cualquier afirmación sobre esa exposición. El modelo basal/extendido y cualquier regla de emisión forman un único procedimiento fijado, no alternativas entre las que se elige por su p o resultado.
- **Miradas incluidas:** cortes calendario a 3, 6, 9, 12, 15, 18, 21 y 24 meses; además 27, 30, 33 y 36. Siempre se incluyen las miradas insuficientes (abstención); no se reinicia el presupuesto por no tener datos. 24/36 son prefijos anidados del mismo historial, no muestras independientes.
- **Consultas y revisiones:** visitas, cambio de pantalla o de selector A/B no crean inferencias nuevas. El próximo diseño debe conservar un recibo analítico por corte/método; otra revisión del mismo pasado no abre otra oportunidad para emitir una alerta. Una edición material invalida la confirmación del hallazgo y exige mostrarlo como no confirmado hasta el siguiente corte bajo la política preregistrada. Recalcular repetidamente hasta que aparezca un patrón queda fuera del protocolo.
- **Alcance explícito:** no se añade a las familias públicas legacy. Este 1 % se estudia para la unión del candidato/resultado/direcciones/miradas anteriores, **no** se acredita como riesgo global de OWNLEVEL. Antes de convivir con otras alertas, la unión completa de familias/resultados/miradas deberá quedar inventariada y validada bajo un presupuesto conjunto autorizado. Covariables de ajuste no producen hallazgos propios. No se cambia `risk_budget_not_approved`, ni se habilitan métodos anteriores o «consistente» por aprobar este objetivo.

**Criterio de riesgo propuesto para congelar:** IC binomial exacto bilateral del 95 % por historial/escenario, usando su cota superior; exigir ≤ 0,01 en **cada** nulo, sin agruparlos, tanto a 24 como a 36 meses. El segundo horizonte se mantiene como guarda adicional conservadora: un fallo a 36 no se convierte en éxito acortando la prueba. Estos IC son individuales, no una garantía simultánea incondicional sobre todos los mundos posibles. Se publicarán conteo/n, IC, abstenciones y ambos horizontes incluso si uno falla.

### Unidad, temporalidad y método a desarrollar

Una observación es un día lógico cerrado con exactamente una sesión completada, con inicio/final ordenados, previa de energía ubicable antes del inicio/primera serie y respuesta post con la ventana de captura vigente. Cada captura usa el instrumento `energy-fatigue/1`; otra escala, relojes inciertos, respuestas tardías y días con varias sesiones se excluyen y cuentan por motivo. La exposición reutiliza la regla publicada de proteína: solo datos conocidos y tiempo explícito; faltantes de nutriente u horas que puedan caer en la ventana impiden interpretar esa exposición. No usar comidas posteriores, totales del día, peso del día o sueño sin final conocido como antecedentes. No reconstruir retrospectivamente ingesta completa.

**Prototipo nuevo propuesto:** predicción temporal reservada, no otra permutación libre de sesiones. Comparar un modelo ordinal basal (energía previa, rutina, hora registrada y términos calendario fijos) con el mismo modelo más la única exposición. Ambos producen cinco probabilidades; evaluar con una regla de puntuación probabilística ordinal propia, suma de errores de probabilidades acumuladas, sin promediar la escala. Entrenar exclusivamente con pasado y evaluar en el siguiente bloque calendario; el producto no muestra ese score. La estadística primaria es la diferencia de pérdida fuera de muestra basal−extendido, con una regla de emisión única y bilateral congelada en desarrollo. No elegir retrospectivamente ventanas, signos, cortes o subgrupos. Ajuste y penalización, mínimo de sesiones y semanas, variación de exposición, límites de complejidad y umbral de emisión deben quedar cerrados antes de cualquier historia reservada. Esta es una especificación de investigación, **no** un método validado ni código público pendiente de encender.

Se requiere variación de proteína dentro de contextos comparables y suficiente solapamiento de rutinas/previa/horario. Un cambio de rutina perfectamente alineado con la exposición, un contexto no registrado, ausencia selectiva o pocos niveles observados impiden atribuir información incremental de forma defendible: abstenerse, no rellenar ni atribuir el cambio a la comida. Un calendario ajustado no garantiza eliminar confusión no observada. La API actual ofrece la lectura revisada, no un archivo inmutable de todos los prefijos históricos: antes de un producto automático hace falta resolver ese recibo por corte mediante un EXPAND independiente. No se implementa almacenamiento ni se pide una captura nueva al usuario en esta entrega.

### Validación y utilidad, sin ejecutarlas ahora

1. **Desarrollo separado:** fixtures analíticas y generadores identificados como desarrollo; probar recuperación de parámetros, ausencia/errores de instrumento, reloj, medianoche, revisiones y propiedades de uso exclusivo del pasado. Semillas y escenarios nunca se reutilizan como reserva. Fijar modelo, reglas de abstención, emisión, candidatos, todos los cortes, tamaño de muestra, riesgo, potencia y costo en un manifiesto/versiones antes de generar la primera historia reservada. No recalibrar #417/#419 ni abrir otra campaña anterior.
2. **Reserva nueva propuesta:** tamaño fijo de 4.096 historiales independientes por escenario; los prefijos 24/36 son de cada una de esas historias. Mantener escenarios independientes, autocorrelación, tendencia, cambio de rutina conocido/no registrado, rutinas alternadas, ausencia selectiva, horas inciertas y temporalidad inversa. Agregar pruebas de modelo mal especificado, falta de solapamiento y ediciones/reconsultas. Un nulo estadístico debe declarar ausencia de información predictiva incremental; ausencia de efecto causal por sí sola **no** es ese nulo. Los escenarios de confusión/selección que sí generan asociación deben declararse desde el inicio como estrés de abstención, sin reclasificarlos después para salvar un resultado. Si la información observada no permite separar esos escenarios de un efecto útil, registrar el bloqueo de identificabilidad, no una garantía causal.
3. **Potencia/uso útil:** escenarios preregistrados de asociación predictiva, sin interpretación causal: diferencia de 15 y 30 puntos en `P(energía post ≥ 4)` entre los cuartiles de exposición, manteniendo previa/rutina, con coberturas alta, intermedia y escasa. Propuesta de utilidad: cota inferior del IC 95 % de detección ≥ 80 % en los escenarios de cobertura nominal alta; denominador = todos los historiales del escenario, también los que se abstienen. En coberturas intermedia/escasa se informa detección y abstención, no se descartan historiales para inflar potencia. Un detector que nunca emite no pasa este gate. La relevancia de estos efectos es una hipótesis de producto, no un umbral clínico. Los escenarios positivos se conservan aunque los nulos fallen: su ejecución/orden futuro se fija en el protocolo, sin informar cero si no se ejecutaron.
4. **Decisión:** riesgo y utilidad son condiciones conjuntas. Si alguna condición no se acredita, no publicar, no ampliar muestra tras observarla y no cambiar umbrales dentro de la reserva. Una revisión del método exige otro protocolo y otra reserva; conservar resultados fallidos y límites.

**Costo estimado, no medido:** dos ajustes por corte, hasta 24 por historial a 36 meses, sin búsquedas por tarjeta. Con nueve nulos de 4.096 historias, hasta 884.736 ajustes antes de positivos/estrés; los cortes pueden abstenerse antes de ajustar. Memoria secuencial de una historia y matrices de diseño; tiempo del orden de `historias × cortes × iteraciones × sesiones × parámetros²`. Hay que fijar caps y medir solo la viabilidad de ese prototipo antes de aprobar una campaña reservada; no se hizo benchmark ni se promete latencia. Para el futuro producto, lectura fuente existente y ejecución solo al corte programado, nunca al terminar, abrir Entrenar o cambiar A/B. Se mostrarían cobertura, exclusiones, periodo de entrenamiento/reserva, estabilidad por bloque y evidencia consultable; si no alcanzan, «sin evidencia suficiente», no «no hay relación».

No falta una decisión para terminar Comparar semanas. Antes de ejecutar esta investigación habrá que congelar y revisar los parámetros del prototipo y su presupuesto computacional; la aprobación de Nacho del objetivo del 1 % queda registrada aquí, separada de aprobación metodológica/publicación. Ninguna campaña reservada se ejecutó en esta entrega.


### Prototipo ejecutable aislado — contrato congelado antes de medir (8 de noviembre de 2026)

Este incremento no depende de la UI de #440. Vive en `src/lib/progress/insights-research/protein-energy/`, sin importadores productivos, endpoints, persistencia ni campaña reservada. Las definiciones siguientes concretan el diseño anterior; no recalibran los métodos históricos.

**Respuesta experimental:** energía post de `energy-fatigue/1`, entera 1–5, declarada post y capturada entre el final y el final + 2 h, inclusive. Se cuentan por separado anteriores al final, dentro de ventana, tardías, sin instante legible, ausentes y malformadas. La ventana pública histórica no cambia. El reloj declarado del cliente no es una verificación independiente del momento real. Se pierde toda la cobertura anterior al final; se reporta, nunca se rellena.

**Unidad y fuente:** un día cerrado con exactamente una sesión completada, fecha válida, inicio/final explícitos ordenados, rutina identificada y energía previa antes del inicio o de la primera serie completada. Proteína registrada (incluido cero explícito) según `foodBeforeSession` en [inicio − 3 h, inicio), con su exclusión canónica de comidas sin hora/no verificadas/macros parciales; ausencia no es cero. Las ventanas cruzan medianoche. Se exigen snapshots de la fuente separados e identificados en cada corte; no se simula un histórico inmutable a partir de la lectura revisable actual. La procedencia/as-of de esos snapshots es una precondición del llamador, no una garantía que este módulo pueda certificar.

**Modelos fijados:** softmax de cinco categorías, no media de la escala ni regresión de un puntaje continuo. Basal: intercepto; energía previa categórica (4 indicadores); rutina (máximo 4, hasta 3 indicadores); seno/coseno del horario y día de semana; tendencia lineal de calendario desde el ancla / 1096 días. Extendido: los mismos y `log1p(proteína)` centrado/escalado exclusivamente en entrenamiento, truncado a ±3. Máximo 14 columnas × 5 coeficientes. No presupone odds proporcionales. Inicialización por frecuencias con pseudoconteo 0,5, ridge 0,03 excepto interceptos, 256 pasos de gradiente completo, paso conservador `1 / (0,5 × max ||x||² + ridge)`. Sin búsqueda de hiperparámetros; se auditan objetivos inicial/final y norma del gradiente, sin afirmar convergencia exacta.

**Tiempo:** ancla explícita primer día de mes; 12 oportunidades en meses 3, 6, …, 36. Cada evaluación usa el trimestre inmediatamente anterior y se ajusta solo con el snapshot anterior al comienzo de ese bloque. Entrenamiento expansivo; una observación evaluada podrá ser pasado en un corte posterior, nunca entrenamiento y evaluación del mismo ajuste. No se elige la fecha por el resultado. Sin snapshot exacto se abstiene. Cambios posteriores no reescriben una predicción previa.

**Soporte fijado:** mínimo 96 observaciones de entrenamiento, 24 de evaluación y cobertura evaluable ≥60 % de todas las sesiones completadas del bloque; mínimo 3 categorías objetivo en entrenamiento. Máximo 4 rutinas. Celda de soporte rutina × energía previa × bloque horario de 6 h: ≥8 observaciones pasadas, ≥4 cantidades distintas y desvío de `log1p(proteína)` ≥0,15. Solo se predicen exposiciones dentro del rango pasado de su celda. Contextos nuevos, proteína constante y falta de soporte se excluyen explícitamente; no se extrapolan para emitir. Esto no prueba positividad ni controla confusores ocultos.

**Evaluación y salida:** RPS = suma de los cuatro errores cuadrados de probabilidades acumuladas (0–4), sin promedio de la escala ([fundamento del score propio](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf)). Una única diferencia media `RPS basal − RPS extendido`, sin buscar subgrupos, dirección, otros macros o resultados. Diagnóstico de desarrollo si diferencia ≥0,02 y positiva en ambas mitades cronológicas (≥12 cada una); si no, sin ganancia de desarrollo o abstención por cobertura/soporte/numéricos. **0,02 no es un umbral de significación ni acredita el 1 %.** No se infiere dirección de asociación; menos aún causalidad.

**Miradas conjuntas:** un candidato, un resultado ordinal (no cinco tests), ambas direcciones y todas las 8 miradas hasta 24 meses y 12 hasta 36, incluidas las insuficientes. Repetir una consulta con el mismo recibo no abre oportunidad nueva; revisar datos de un corte consumido invalida su continuación, no permite reintentar buscando una señal. El llamador debe conservar el ledger: el módulo puro no persiste ni puede evitar que alguien lo descarte. No hay señal pública. Una futura regla pública deberá calibrarse y validarse conjuntamente, incluyendo abstención y todos los caminos de emisión; el diagnóstico actual no pretende ya cumplir ese control.

**Objetivo reservado aprobado, aún no ejecutado:** ≤1 % de historiales con alguna falsa alerta a 24 meses, usando la cota superior del IC binomial exacto bilateral del 95 % en cada escenario nulo preregistrado, más evaluación a 36 meses sin recortar horizontes previos. Acreditar también capacidad de detectar efectos relevantes; nunca emitir no cumple el producto. No es garantía sobre datos reales. Siguen pendientes inventario final de escenarios, congelación de generadores/reserva y regla inferencial de emisión. Se mantienen los resultados de #412/#417/#419/#420 y sus límites.

**Qué cambia y qué no:** pregunta incremental fuera de muestra con ajuste basal explícito y abstención por soporte, en lugar de volver a correlacionar el nivel de proteína con el resultado. No resuelve selección de respuestas, confusión no medida, errores del reloj, cambios ocultos de rutina, especificación del modelo ni control de falsas alertas por sí solo. La validación nula debe significar ausencia de información predictiva adicional condicional, no meramente ausencia de un efecto causal simulado.

**Presupuesto de viabilidad fijado antes de ejecutar:** dos semillas de desarrollo (17011, 17029), tres escenarios (`null`, `effect`, `confounded`), seis historiales de 36 meses, 72 oportunidades programadas. Límite total 120 s y 512 MiB RSS del proceso; sin reserva, sin campaña anterior ni ajuste posterior para aprobar. Se registrarán tiempos por historial/corte, RSS/heap observados (no atribución causal de memoria), abstenciones, pérdidas y costo extrapolado. Los escenarios y resultados son desarrollo, no estimación acreditada de error o potencia.


#### Resultado de viabilidad de desarrollo (no validación)

Contrato fijado en `8246600`; implementación medida en `988bee4` (Node 22.19.0, Darwin arm64). **Una sola medición**, seis historiales sintéticos de 36 meses, 72 cortes programados, 80 ajustes ejecutados: 8,892 s de trabajo (9,801 s del comando con arranque), sin exceder 120 s / 512 MiB. No se inspeccionó ni generó reserva.

| Escenario de desarrollo | Semillas | Resultado observado |
| --- | --- | --- |
| Sin información incremental de proteína | 17011, 17029 | Ninguna señal diagnóstica; ganancias RPS por corte entre −0,0050 y +0,0023 |
| Efecto sintético fuerte sobre probabilidades ordinales | 17011, 17029 | Diagnóstico en meses 9–36; ganancias 0,2681–0,4913 |
| Proteína constante dentro de rutina, distinta entre rutinas | 17011, 17029 | Abstención en todos los cortes; sin soporte intracontexto desde el mes 9 |

Todos se abstuvieron en los meses 3 y 6 por entrenamiento insuficiente. El generador de desarrollo usa seis sesiones/semana, dos rutinas y respuesta completa: **cobertura muy superior a muchos historiales reales**. El efecto se generó con logits conocidos, no representa el tamaño de un efecto real ni los efectos nominales de la futura validación. Dos semillas no estiman ni acreditan potencia/error. Las ausencias selectivas, cambios de rutina y horas desconocidas se cubren además con regresiones de corrección, no con una campaña estadística.

Tiempo por historial: 0,482–2,273 s (con ajuste: 1,850–2,273 s). Corte: mediana 0,082 s, máximo 0,403 s. RSS al terminar cada corte: 104,94–166,69 MiB; máximo acumulado del proceso trabajador: 170,50 MiB; heap observado máximo: 60,39 MiB. Son memoria total observada del trabajador y máximos acumulados, **no memoria marginal atribuida al corte ni suma de todos los procesos**. Los informes retienen tiempos/memoria, cortes, pérdidas, coberturas y recibos sintéticos completos.

Extrapolación lineal orientativa, mismo equipo y densidad: 9 × 4096 historiales a 36 meses costarían unas **19–23,3 horas secuenciales** usando tiempos de historiales con ajustes. Máximo presupuestado 884.736 ajustes (24 por historial), frente a 20 por historial elegible en esta muestra por abstenciones iniciales. No incluye escenarios adicionales, positivos, controles, almacenamiento ni variación de costo; no justifica ejecutar la campaña. El costo de desarrollo es viable, la acreditación metodológica sigue pendiente.

**Corrección:** caso independiente de intercepto con cinco categorías equiprobables y RPS manual 0,4 para respuesta 3; probabilidades extremas; independencia temporal y de etiquetas futuras; ledger/revisión; exposición constante y confusión con rutina; nuevas rutinas/rangos; medianoche, cero/ausencia, captura durante/posterior y pérdida selectiva. Las primeras pruebas encontraron alias entre snapshots sintéticos y caché por identidad de comidas; se aislaron los snapshots y las filas de preparación sin alterar el helper público, modelos ni umbrales. Hubo además un error de ruta y una aserción de propiedad incorrecta; se conservó el registro de esas correcciones.

**Reproducción acotada:** desde la raíz, `node scripts/insights-research/protein-energy-development.mjs /ruta/absoluta/development-report.json`. El runner solo expone las seis historias de desarrollo fijadas y escribe informe + seis auditorías; plazo externo de 120 s, guardas por corte, sin parámetros de búsqueda/reserva. Normalmente su prueba está omitida salvo activación expresa. Las pruebas de corrección se ejecutan con `node node_modules/vitest/vitest.mjs run src/lib/progress/insights-research/protein-energy/prototype.test.ts`.

**Siguiente punto de revisión:** está listo para revisar código y redactar/congelar el protocolo reservado, **no para ejecutarlo**. Antes faltan una regla inferencial conjunta (el diagnóstico RPS de desarrollo no es tal regla), inventario cerrado de nulos/positivos y todas las oportunidades, generadores independientes y decisión de aprobación con IC95 por escenario a 24/36 meses más utilidad. La ausencia selectiva, confusión oculta y cambios de rutina deben permanecer como estrés/abstención, no reclasificarse tras ver resultados. Datos reales requieren snapshots as-of verificables; este módulo no los obtiene. No hace falta otra decisión de producto de Nacho para revisar estas piezas; el objetivo de riesgo ya está aprobado solo como investigación. #367 sigue abierto y no se habilita ninguna asociación.

Verificación del candidato: **15 regresiones de corrección aprobadas**; la prueba de medición queda omitida en la corrida normal y se ejecutó una vez mediante el runner acotado. Tipos raíz y lint de los archivos nuevos aprobados. Sin validación Mobile completa ni export: ninguna pantalla, lector productivo o configuración de Metro importa este módulo. Cero consultas o escrituras de producción.

### Procedimiento inferencial y protocolo reservado — continuación de #441

**Estado:** candidato de investigación revisable, aislado. `diagnosticGain=0,02` permanece exclusivamente diagnóstico y no participa de la regla inferencial. Se conservan `POLICY`, las semillas 17011/17029, los informes y los resultados históricos anteriores. Las nuevas condiciones prospectivas no convierten aquellos backtests en inferencia válida. No se ejecutó ni generó la reserva.

#### Qué contrasta y qué puede afirmar

Sean X = energía previa, rutina, horario y calendario; P = proteína registrada con hora explícita en [inicio−3 h, inicio); Y = energía post ordinal 1–5 del instrumento fijado. **Nulo de información:** la distribución de Y elegible, condicional a X y al pasado disponible, no cambia al conocer P. No equivale a ausencia de efecto causal: un confusor oculto puede hacer predictiva a P sin que P cause Y.

**Nulo efectivamente contrastado por esta implementación:** para los dos procedimientos fijados, la suma de las ventajas esperadas de pérdida RPS del extendido frente al basal no es positiva en ningún prefijo observado. Con `Z_i=A_i*(RPS_basal−RPS_extendido)/4`, se define `mu_i=E[Z_i | pasado completo y características/pronósticos actuales conocidos antes de la respuesta]`; H0 exige `sum(mu_i, i<=t)<=0` para todo prefijo t. A_i incluye elegibilidad de la respuesta y del día cerrado. Se admite dependencia temporal, distribución cambiante y ajuste con el pasado; no se supone iid, ni se permutan sesiones. La interpretación es ventaja predictiva media de **estos pronósticos emitidos**, no una propiedad de todo modelo posible.

Una emisión de investigación permite decir: «hay evidencia contra ausencia de ventaja predictiva media del procedimiento extendido en el prefijo evaluado, bajo el protocolo y sus supuestos». No permite decir que más proteína implica más energía, que hay independencia/ dependencia condicional identificada, que el efecto se sostendrá en el futuro ni que hay causalidad. `not_rejected` tampoco significa ausencia de relación; `abstain` identifica imposibilidad de aplicar o emitir con esa cobertura/soporte.

**Bloqueo de identificación explícito:** el nulo de información no implica por sí solo el nulo entre dos predictores estimados. P puede aproximar una función de X que el basal especificó mal, aun cuando no agregue información al condicionar en X completo. No se presentará esa ganancia como una prueba de información nueva. El cambio mínimo implementable aquí es limitar la afirmación al contraste entre pronósticos y exigir compromisos prospectivos; para responder al nulo de información original hace falta justificar/calibrar además el modelo condicional pertinente (por ejemplo, bajo supuestos identificables sobre Y|X o P|X y el proceso temporal). No se inventa ese modelo en esta entrega. La dificultad general de independencia condicional sin supuestos está documentada por [Shah y Peters](https://arxiv.org/abs/1804.07203). A6 permanece nulo de información aunque favorezca al extendido por especificación: si emite por encima del presupuesto, **falla la acreditación del objetivo original**, no se mueve a estrés.

#### Regla conjunta y prueba de alcance

La construcción de comparación secuencial de pronósticos usa un e-process de Bernstein empírico con apuesta fija y mezcla discreta; su fundamento es [Choe y Ramdas, §4.4, teorema 3](https://arxiv.org/abs/2110.00115), con las condiciones de orden temporal y acotación aplicadas a la pérdida ordinal. No se atribuye validez universal a las simulaciones de desarrollo.

Para cada `lambda` en `{1/16,1/8,1/4,1/2,3/4}` se acumulan `S_t=sum(Z_i)` y `Q_t=sum(Z_i^2)`; `psi(lambda)=−log(1−lambda)−lambda`; `E_t(lambda)=exp(lambda*S_t−psi(lambda)*Q_t)`. La evidencia es la media equiponderada de los cinco E, calculada con log-sum-exp. No se escoge la mejor apuesta después. Se usa centro previsible 0 y `|Z|<=1` por RPS en [0,4]. Para verificar el argumento: `exp(lambda*z−psi(lambda)*z²)<=1+lambda*z` para z≥−1; al centrar por mu se obtiene un supermartingala no negativo, y bajo H0 la evidencia no lo supera. Una mezcla fija conserva la dominación. La desigualdad máxima controla la oportunidad de cruzar en cualquier momento **solo bajo ese nulo y esas condiciones**, no bajo mera ausencia de causalidad o de información condicional.

**Presupuesto:** alpha=0,005 para este único procedimiento durante todo el historial hasta 36 meses; umbral E≥200 en un corte trimestral con cobertura/soporte suficientes. Se eligió por debajo del objetivo empírico 0,01 para dejar margen al IC de acreditación, no tras observar una reserva. No hay reparto renovable por trimestre. Candidatos: una proteína/ventana; resultado: una distribución ordinal de energía (no cinco contrastes); comparación: un basal/extendido y una variante congelada de ajuste. Ambas posibles direcciones de P están contenidas en el mismo extendido; no hay salidas separadas «proteína positiva/negativa». Las cinco apuestas son una mezcla, no cinco intentos. Ocho cortes hasta 24 meses, doce hasta 36, y ninguna oportunidad adicional por abrir/reintentar. La parte 0,005 no asignada del techo 0,01 **no se puede reutilizar automáticamente**. Una variante nueva necesita un nuevo protocolo conjunto; cambiar versión, reiniciar ledger o elegir otro ancla no renueva presupuesto para el mismo historial.

Las coberturas/mínimos de #441 se conservan. La cobertura se usa únicamente para impedir una emisión al cierre; no elimina puntuaciones desfavorables o bloques ya revelados. Respuesta ausente, tardía, durante la sesión, ilegible o de otro instrumento: A=0 y contribución nula, contada como ensayo sin respuesta elegible. Falta de soporte conocida antes de Y: no se hace pronóstico. El código nunca usa `diagnosticGain`, dirección de coeficientes, mitades favorables ni subgrupos para inferir significancia. Solo la primera emisión se cuenta como alerta; los doce cortes siguen auditables.

#### Orden de información, población y ledger

Población: pronósticos comprometidos para sesiones completadas con características canónicas elegibles, dentro del soporte pasado y con una sola sesión completada en el día lógico finalmente cerrado. El resultado observado es la respuesta declarada post entre final y +2 h, recibida después del compromiso. Desconocido no es cero y no se estiman energías faltantes. Las inferencias no se extienden a sesiones/horarios que no pudieron registrarse, a respuestas anteriores al compromiso ni a la energía no observada.

El ajuste sigue usando exclusivamente el snapshot anterior al bloque. `forecastBeforeResponse` recibe una fuente atestiguada como conocida en ese instante, rechaza un post ya disponible y proyecta solo los insumos de características: ninguna etiqueta o fila futura entra en probabilidades **ni en su hash**. Devuelve probabilidades, hash del modelo/snapshot y momento del compromiso. Se exige que el compromiso preceda a la captura post. Se finaliza la pérdida después de cerrar tanto el día como la ventana post, con el número final de sesiones del día; si el día es múltiple se incorpora A=0, sin retirar una contribución previa. Mientras haya un ensayo pendiente no se acepta otro: exclusión conservadora ante solapamiento. No hay sleeps ni tareas productivas.

Ledger puro con identidad estable, ancla/versión, asignación única, modelos y hashes de snapshots, compromisos, revelaciones, S/Q/logE y cortes. Un replay idéntico no cambia estado. Cambiar una predicción, respuesta, corte cerrado o snapshot congelado invalida la continuación y no permite otra oportunidad. Un snapshot posterior puede incorporar información nueva para **ajustes futuros**, conservando los originales y todos los pronósticos anteriores. No hay reinicio de evidencia tras cobertura insuficiente. Numéricos inválidos/corrupción nunca se convierten en «sin relación».

Esto no es una frontera criptográfica ni verifica el reloj del cliente o que una fila se conocía realmente entonces: el llamador debe conservar compromisos y procedencia as-of. La lectura productiva actual no suministra estos recibos; por eso **no se puede aplicar retrospectivamente a Nacho ni publicar asociaciones con estos registros actuales**. No se agrega almacenamiento productivo para suplirlo.

#### Inventario definitivo del candidato, antes de generar reserva

Generador `protein-energy-scenarios/1`. Convenciones comunes: ancla 2022-01-01, horizonte único de 36 meses con vistas anidadas a 24 y 36; seis sesiones/semana salvo A8, una por día; rutinas alternadas por semana; pre uniforme {2,3,4}; inicio 18–19 h, duración 1 h; comida con hora explícita inicio−1 h; post final+5 min. P uniforme en {0,5,15,30,50,80} salvo modificaciones indicadas. Distribución base de Y: `[0,1−0,03*(pre−3); 0,35; 0,15; 0,30; 0,1+0,03*(pre−3)]`. «Mover m» resta m a categoría 2 y lo suma a 4. No hay medias ordinales. AR comienzan en cero y las innovaciones son uniformes [−1,1]. Parámetros y orden efectivos están en `scenario-generator.ts`/`reserved-protocol.ts`, ligados al commit revisado.

| Grupo / ID | Mecanismo fijado | Elegibilidad/cobertura esperada y criterio |
| --- | --- | --- |
| A1 iid | Base, P independiente de Y dado X | Completa; IC95 superior de alguna alerta ≤1 % a 24 y 36 |
| A2 serial | P=clip(40+80*U,0,80), U AR(0,8); mover 0,10*V, V AR(0,7) independiente de U | Completa, posibles extremos fuera de soporte; mismo criterio A, sin exigir independencia entre sesiones |
| A3 cambios observados | P=P_base/2+20*rutina+10*I(día≥548); mover ±0,08 por rutina y ±0,05 por cambio de calendario | Cambios de soporte explícitos; mismo criterio A |
| A4 ausencia MAR | Se observa post con probabilidad 0,8−0,3*I(P>30), sin depender de Y | Cobertura desigual por P, abstención si <60 %; mismo criterio A, incluyendo todas las abstenciones en N |
| A5 varianza | Desde día 548 sumar 0,05 a categorías 1/5 y restar 0,10 a 3; antes operación inversa | Completa; mismo criterio A |
| A6 proxy no lineal | P=max(0,40+30*sin(día/27)+5*U); mover 0,15*sin(día/27) | Calendario exacto observado en X; basal puede estar mal especificado. Sigue siendo nulo de información y debe pasar el mismo criterio A; ninguna reclasificación |
| A7 tiempos no selectivos | 30 % de post sin hora, 10 % anteriores al final, 10 % a +3 h, 50 % dentro; independiente de P/Y | Baja cobertura y abstenciones esperables; mismo criterio A, no pasa por excluir historias insuficientes |
| A8 escaso | Solo martes/viernes, todo lo demás base | Más abstenciones iniciales; mismo criterio A |
| B1/B2/B3/B4 | Mover `delta*log1p(P)/log(81)`, delta=+0,15/+0,30/−0,15/−0,30 | Completa; contraste exacto entre extremos 0 y 80 g en P(Y≥4). IC95 inferior de detección ≥80 % en **cada** positivo a 24 y 36, todas las historias incluidas |
| C1 confusión oculta | U no observado; P=40+40*U; mover 0,15*U | P predice sin efecto causal directo; no es nulo de información. Reportar alertas/cobertura, sin exigir que toda confusión sea identificable |
| C2 selección | Respuesta con probabilidad 0,95 si coinciden P>30 e Y≥4; 0,15 si no | Selección dependiente del resultado; reportar límites y abstenciones, nunca atribuir causalidad |
| C3 reloj | 70 % de comidas sin hora explícita; 20 % de post con captura real final−5 min pero reportada final+5 min (verdad sintética de auditoría separada) | Falta de cobertura y error no identificable desde la hora reportada; reportar, sin prometer detectar el reloj falso |
| C4 sin solapamiento | P=5 u 80 según rutina, constante dentro de cada contexto | Todas las historias deben abstenerse sin alerta |
| C5 rutinas nuevas | Identidad de rutina nueva cada 91 días | Sin soporte de contexto al cambio/máximo de rutinas; todas deben abstenerse sin alerta |
| C6 revisión | Al mes 9 modificar la revisión del snapshot del mes 3 ya consumido | Invalidar historia y abstenerse sin reinicio/alerta |

A son nulos de información por su mecanismo, **no garantías automáticas de H0 de riesgo entre modelos estimados**. C1/C2 pueden tener información predictiva real aunque no efecto causal. C3 no se «resuelve» observando una etiqueta de procedencia. No se promete identificar confusión oculta. No se sustituyen ni recortan los resultados históricos de los métodos anteriores.

#### Reserva, tamaño, utilidad y decisión

Orden fijo: A1–A8, B1–B4, C1–C6; índice de historial creciente, un trabajador, sin parar por éxito ni seleccionar semillas. N=4.000 por A, 1.000 por B y 400 por C: **38.400 historiales**. No se arrastró 4.096: con 4.000, el máximo que acredita cota superior bilateral IC95≤0,01 es **27 alertas**; 28 falla. Si la tasa verdadera fuera 0,005, la probabilidad binomial de pasar ese criterio en un escenario sería aproximadamente 94,8 %, no una garantía conjunta. Cero alertas daría cota 0,000922, no error cero. Son cálculos de diseño sin generar historiales. Para utilidad N=1.000 exige **825 detecciones** para IC95 inferior≥0,80 (824 falla); si la detección verdadera fuera 0,85, la probabilidad de acreditar sería aproximadamente 98,7 %. Esto no afirma que el procedimiento alcance esa detección. N=400 en estrés es diagnóstico de seguridad/abstención, no acreditación de un 1 %.

Intervalos por inversión exacta bilateral de colas binomiales al 95 % ([Clopper–Pearson](https://doi.org/10.1093/biomet/26.4.404)); se requieren todos los escenarios y ambos horizontes, sin pooling. Los IC son por escenario/horizonte, no una banda conjunta del 95 % sobre toda la tabla. Mantener el objetivo aprobado: máximo del 1 % de historiales con alguna falsa alerta a 24 meses por cota superior, más 36 meses, sin acortar un horizonte anterior. La utilidad es parte obligatoria de la decisión: nunca emitir no aprueba. Cualquier fallo técnico impide aprobación; además se cuenta conservadoramente como alerta para el nulo y como no detección para positivos. Incompleto jamás aprueba.

Semillas de reserva: namespace fijo `OWNLEVEL-367-protein-energy-reserve-20261109-v1`; semilla de cada historia = SHA256(namespace + ':' + ID + ':' + índice base cero); uniformes por contador = primeros 13 hex de SHA256(semilla_hex + ':' + contador_base_cero)/2^52. No se han realizado esas extracciones. Tests nuevos usan namespaces `development-*` y los fixtures antiguos conservan sus semillas. `protocolHash()` incluye política predictiva, inferencia, inventario y límites; la autorización externa futura también exige el SHA del candidato limpio, que liga generador, runtime y runner. Cualquier corrección posterior invalida la autorización/reserva de esta versión; no se reutiliza para calibrar. Las dependencias y versiones se toman del lock y del Node registrado, sin reinstalar.

Runner preparado con modos `plan`, `status` y `execute`: `node scripts/insights-research/protein-energy-reserved.mjs plan /ruta/absoluta/plan.json` solo escribe metadatos. `status /checkpoints /informe.json` informa lo completado sin nuevos sorteos. `execute /checkpoints /aprobacion.json /informe.json` exige un manifiesto externo con `reservedValidationAuthorized:true`, `protocolHash`, `candidateCommit` y `inferenceClaim:"forecast-risk-only"`; **no se creó ese manifiesto ni se ejecutó ese modo**. La aceptación de ese alcance no acreditaría la pregunta de independencia condicional original.

Checkpoints locales por corte atómico e historial, checksum, plan/candidato fijados y lock exclusivo. Reanudar no vuelve a procesar historias completas ni cortes confirmados; un corte interrumpido sin commit se reproduce determinísticamente, sin otra oportunidad estadística. Se conservan resultados parciales y N pendiente; no se permite aprobar un subconjunto de éxitos. Revisiones/corrupción no se ignoran. Presupuesto agregado 36 h CPU, 48 h de pared, 512 MiB RSS del trabajador, heap 384 MiB, 1 GiB en checkpoints y un trabajador; cada invocación reserva por adelantado hasta una hora de CPU/pared, devuelve el tiempo no usado al cerrar ordenadamente y deja la hora entera cargada si el proceso muere. Guardas entre cortes/observaciones, plazo externo de invocación y reanudación explícita; agotar límites deja la evaluación incompleta, no autoriza subirlos automáticamente. El estado local de investigación no es almacenamiento productivo.

**Presupuesto de medición añadida, fijado antes de correr:** solo la aritmética nueva sobre las seis auditorías de desarrollo ya existentes (17011/17029), veinte repeticiones, máximo 30 s y 384 MiB RSS. Sin reajustar modelos, volver a medir sus resultados ni usar reserva. Los recibos históricos carecen de compromisos prospectivos: se usan para costo, **no para publicar significancia retrospectiva**. Se reportará por separado lo que esta medición excluye (creación de recibos, checkpoints/IO y ajuste).

**Congelación para revisión:** el candidato es completamente especificado para comparación de pronósticos y permite revisar fórmula, supuestos, inventario, recibos y ejecución. No está autorizado para reserva ni para una conclusión de información condicional independiente del modelo. Esa brecha de identificación y la disponibilidad real de compromisos as-of son bloqueos explícitos para el objetivo original. No se cambia el significado público de ningún dato; #367 sigue abierto.
