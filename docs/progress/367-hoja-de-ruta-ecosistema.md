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
