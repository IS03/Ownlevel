# OWNLEVEL Insights #367 — propuesta de Etapa 0

Fecha: 02/11/2026. Rescatada de la conversación para continuidad en Windows.

**Estado: planificación, sin implementación y sin aprobación de las propuestas metodológicas.**
La autorización actual permite preservar y publicar este documento, no ejecutar las etapas siguientes.
No se hicieron cambios de código, contratos, base de datos o datos personales para #367.

Issue y auditoría base: https://github.com/IS03/Ownlevel/issues/367.
Base revalidada: main `145c0d31bde5994684d7d934e960842646608695`.
El trabajo separado de #380 está en `codex/rework-376-378-377`; no forma parte de esta rama.

## Decisiones ya confirmadas en el issue

- Progreso y resumen post sesión; paridad de significado Web/Expo.
- Todo el historial válido, sin obligar a elegir semana/mes; referencias locales para la progresión.
- Energía y fatiga separadas antes/después, opcionales; reutilizar el formulario final y conservar rendimiento percibido/dolor/notas.
- Toda métrica numérica válida por UUID puede participar, incluidas personalizadas y archivadas. Sin whitelist por nombre, unidad, objetivo o system_key.
- Asociaciones diarias por metric_date. Una carga retrospectiva pertenece a su fecha seleccionada; no acredita anterioridad a entrenar.
- No fusionar identidades ni reescribir historia. Plantillas orientan, no otorgan confianza estadística.
- Evidencia general y asociaciones personales en carriles distintos; redacción determinística, sin LLM necesario ni afirmaciones causales.

## Revalidación dirigida realizada

Se reutilizó la auditoría de #367 sobre `2637cd1`, con Codebase Memory vigente y cobertura comprobada en las fuentes consultadas. No se rehízo una auditoría integral.

- `src/lib/progress/training-performance.ts`: aún puede devolver stable/ambiguous_evidence; un récord puede prevalecer sobre comparación directa. La selección directa actual no concilia todas las señales cruzadas.
- `src/lib/progress/relationships/training.ts`: usa improved/comparable y referencia de 28 días; reconstruye fuentes por sesión y excluye otras sesiones del mismo día de esa referencia.
- `src/lib/mobile-api/training-session-highlights-server.ts` y `training-session-summary.ts`: el resumen usa otra regla, con volumen como desempate y parsers estrictos.
- Relationships Web e influencia Mobile conservan metodologías distintas. No crear una tercera implementación paralela.
- `getRelationshipsWorkspace()` aún llama a ensure_user_metrics y no es un loader puro all-time. `readAllDailyMetricValues()` sí ofrece lectura paginada reutilizable.
- `nutrition-meal-time.ts` incorporó utilidades desde la auditoría, pero su inferencia legacy sigue considerando conocida una hora cuando falta metadata. No basta para elegibilidad horaria estricta.
- El formulario final tiene energía/rendimiento percibido 1–5, dolor 0–10 y notas. No hay fatiga ni RIR realizado en los contratos inspeccionados.

Estas comprobaciones fueron lecturas de código. No se consultaron registros personales, ejecutaron cálculos sobre ellos ni repitieron pruebas de #380.

## 1. Comparación factual por ejercicio

Recomendación: kernel compartido, versionado y optativo para los nuevos consumidores. Cinco resultados:

1. Mejora observada.
2. Estabilidad observada mediante evidencia directa equivalente.
3. Descenso observado.
4. Evidencia mixta/ambigua.
5. Comparación insuficiente, con motivo.

Comprobar UUID, modo/unidad, implemento histórico y configuración verificable. Un cambio conocido incompatible separa comparaciones; contexto histórico necesario ausente no se completa con el catálogo actual.

En carga/repeticiones, conciliar más/menos reps a igual carga y más/menos carga a iguales reps. Señales opuestas implican ambigüedad. Más carga con menos reps no demuestra mejora por sí solo. Falta de señal no equivale a estabilidad. Peso corporal, lingotes y tiempo conservan estrategias propias; sin e1RM universal ni conversiones inventadas.

Récord y volumen se presentan por separado. Un récord de carga puede coexistir con comparación contextual ambigua. Descenso significa registros inferiores, no pérdida de capacidad demostrada: deload, programación y esfuerzo desconocido limitan la interpretación.

Cada comparación conserva referencia, series utilizadas, magnitud, contexto y exclusiones. Un ejercicio cuenta una vez por sesión; filas duplicadas por lectura o bloques repetidos no inflan el denominador. Configuraciones mezcladas dentro del ejercicio requieren una resolución explícita, no una fusión silenciosa.

## 2. Referencia y agregación diaria

Recomendación principal: última exposición compatible finalizada antes del inicio de la sesión actual. Puede ser de ese día si la cronología es válida. Excluir posteriores, simultáneas y orden temporal incierto. Mostrar antigüedad; no imponer 28 días como caducidad universal.

Últimas varias exposiciones y baseline de 28 días son alternativas para sensibilidad sintética, no permiso para elegir retrospectivamente la mejor conclusión.

Por sesión:

`C = mejoras + estabilidades observadas + descensos`

Ambigüedad e insuficiencia quedan fuera de C y permanecen en cobertura/exclusiones.

Para asociaciones diarias se recomienda:

`proporción diaria de descensos = suma(descensos de sesiones) / suma(C de sesiones)`

Es proporción de comparaciones de ejercicios del día, no porcentaje de fuerza perdida. Conservar recuentos por sesión y composición; el denominador diario puede contener el mismo ejercicio en dos sesiones reales distintas. No convertir esas comparaciones en observaciones independientes de la métrica diaria.

El análisis recibe una fila por día lógico. Si suma(C)=0, el resultado es ausente. Cero descensos con C>0 es un valor real.

Antes de promover patrones, contrastar el promedio de proporciones con igual peso por sesión y la sensibilidad a composición/rutina/denominadores. Si cambia sustancialmente la conclusión, abstenerse de promover. Esa validación está pendiente.

## 3. Sensaciones opcionales pre/post

Propuesta: cuatro campos ordinales separados, ninguno preseleccionado y todos omitibles.

| Valor | Energía | Fatiga |
| --- | --- | --- |
| 1 | Muy baja | Nada de fatiga |
| 2 | Baja | Poca |
| 3 | Media | Moderada |
| 4 | Alta | Mucha |
| 5 | Muy alta | Muchísima |

No invertir una escala para derivar la otra ni sumarlas en un score.

Pre: bloque opcional al comenzar, sin modal obligatorio ni bloqueo. Una captura tardía conserva su momento real. Acreditar registro antes de la primera serie registrada no prueba el instante físico del esfuerzo; distinguir ambas afirmaciones.

Post: reutilizar el control actual de energía preguntando explícitamente cómo terminaste y sumar fatiga en el mismo formulario. Rendimiento percibido, dolor y notas siguen independientes; no duplicar el cuestionario.

Los hechos nuevos necesitan versión de instrumento, momento declarado, captura, recepción y calidad temporal. La energía histórica no se convierte retrospectivamente en energía post. Si hay duplicación de escritura para compatibilidad legacy, es un alias del mismo hecho, nunca otra observación analítica.

## 4. Asociaciones de primera versión

| Familia | Alcance propuesto |
| --- | --- |
| Métricas diarias | Todo UUID numérico válido por metric_date frente al rendimiento del mismo día lógico. Ceros, archivadas y dos valores distintos son admisibles; constante indica falta de variación. |
| Nutrición diaria | Kcal, carbohidratos, proteínas y grasas registrados, cuando su agregado sea conocido. No equivale a ingesta completa confirmada. |
| Sensaciones pre | Energía y fatiga temporalmente elegibles frente a esa sesión, tratando dependencia dentro del día. |
| Alimentación horaria | Una exposición inicial: carbohidratos registrados en comidas con hora explícita dentro de las tres horas anteriores al inicio. |

Tres horas es una propuesta de ventana de producto preespecificada, no un óptimo fisiológico aprobado. Otras ventanas se usan para detectar fragilidad, no para seleccionar la más llamativa.

Horario estricto: exigir procedencia explícita comprobable, sin usar como prueba la inferencia visual legacy. Excluir resúmenes legacy, soft deletes, comidas posteriores y tiempos desconocidos. Registration aproximado solo en sensibilidad separada. Macros null no pasan a cero. Ausencia de comidas en la ventana no demuestra cero consumo ni ayuno. La cobertura de registros no demuestra que se conozca toda la ingesta.

Instantes para ventanas horarias, contemplando medianoche/Córdoba; día lógico y metric_date para asociaciones diarias. Agua/pasos totales del día no son exposiciones previas. Post se conserva como resultado/contexto, no predictor previo de esa sesión.

## 5. Evidencia y calibración pendientes

Recomendación: reutilizar Spearman como asociación numérica principal y grupos descriptivos para explicar magnitud. No exigir tres valores distintos universalmente ni mapear clear existente a consistente.

Estados: datos insuficientes; sin señal clara; exploratorio; consistente en tus registros.

Calibrar la política completa con historiales sintéticos: calidad antes de mirar efecto, validación cronológica, bloques de dependencia, rutinas/composición, antigüedad de referencias, outliers, ausencia selectiva, multiplicidad y sucesivas actualizaciones del historial. Contabilizar todos los candidatos/outcomes aunque se publiquen pocas tarjetas.

Consistente exige precisión, estabilidad y sensibilidad aceptables en los escenarios calibrados. No fijar 10/30/50 observaciones como garantía universal, ni aplicar BH sin considerar dependencia. Nada de rangos óptimos elegidos a posteriori, causalidad, multivariable o predicciones en MVP.

Referencias metodológicas consultadas:

- Roberts et al.: https://florianhartig.github.io/publications/roberts2017cross/
- Benjamini y Hochberg: https://rss.onlinelibrary.wiley.com/doi/10.1111/j.2517-6161.1995.tb02031.x

**Decisión de producto pendiente de respuesta:** se propuso priorizar abstención, exploratorios solo en detalle y, como objetivo de riesgo, que como máximo el 1 % de historiales sintéticos completamente nulos publique algún patrón consistente durante una secuencia anual de actualizaciones. El 1 % no fue aprobado, no es un umbral científico y no se validó con simulaciones. Revisar el presupuesto de riesgo antes de fijar promoción.

## 6. Arquitectura y contratos propuestos

Read model específico sobre Foundation y utilidades Relationships; kernel puro común para Web/API Mobile: compatibilidad, referencias, clasificación, agregación, temporalidad, elegibilidad, incertidumbre y copy parametrizado. UI nativa por plataforma.

EXPAND compatible para hechos de sensaciones separados de metadata legacy, revisiones semánticas de métricas cuando cambien unidad/significado y revisión de fuentes para invalidación. Preservar UUID/historia, ownership/RLS, identidad del token, CAS, idempotencia y journal offline. Omitir conserva; borrar requiere intención explícita. Coordinar confirmación post con finish. No ampliar respuestas estrictas para builds instaladas sin negociación/versionado.

Ruta candidata nueva: `/api/mobile/v1/progress/performance-insights`; resumen de sesión versionado para nuevos clientes. Mantener contratos legacy intactos. Resultados con versión de método, referencia, magnitud/denominador, cobertura, exclusiones, incertidumbre y fecha.

Invalidar tras completar/corregir/descartar sesión, comidas/horas, métricas/semántica y sensaciones. Fuentes parciales o cambiantes no generan un insight sobre un subconjunto silencioso. Sin datos privados en logs, service_role cliente ni acceso Mobile directo a tablas de producto.

No reutilizar el workspace inicializador como loader puro ni historias N+1 por ejercicio/sesión. Sin cache persistente de resultados analíticos. #353 está mergeado; su agregado de récords no sustituye el contexto de Insights ni es un prerrequisito.

## Secuencia propuesta de PRs

| PR | Entrega | Aceptación |
| --- | --- | --- |
| 1 | Comparador versionado, referencias y agregación | Modos, ambigüedad, denominadores y cronología; consumidores legacy intactos. |
| 2 EXPAND | Hechos, procedencia, revisiones y contratos | Compatibilidad antigua, RLS, CAS, idempotencia, correcciones y rollback. |
| 3 ADOPT | Captura Web/Expo y journal | Opcional, formulario final reutilizado, captura tardía honesta, offline y QA propio. |
| 4 | Loader agrupado all-time, endpoint y calibración | Sin N+1/leakage, fuentes consistentes, multiplicidad y presupuesto medido con fixtures. |
| 5 | Progreso, resumen post y explicaciones | Misma metodología, accesibilidad, estados honestos y rollout gradual. |

OBSERVE antes de CONTRACT. Esta secuencia no autoriza iniciar PRs y no modifica el cierre pendiente de #380.

## Presupuesto y validación futura

Una solicitud de app al abrir Insights. Sin prefetch all-time en Inicio, polling ni lecturas en pestañas ocultas. Hasta siete flujos agrupados: definiciones, sesiones con fecha, ejercicios, series, valores diarios, comidas y sensaciones.

`Q de fuentes = suma(páginas de cada flujo) + 2 comprobaciones de revisión`

Si cada flujo ocupa una página son nueve lecturas, más autenticación si la requiere. Páginas terminales y flujos vacíos también se contabilizan. Crece por páginas, no por candidato/ejercicio/tarjeta. Cursor estable, columnas mínimas y concurrencia acotada. No publicar si las fuentes cambiaron durante la lectura.

Post-entreno: lectura compuesta limitada a la sesión y referencias; no calcular todas las asociaciones all-time al finalizar.

Objetivos iniciales propuestos para medir: p95 <=3 s, CPU <=1 s, memoria adicional <=128 MiB y respuesta resumida <=128 KiB. No son medidas realizadas ni garantías. Si no entra todo el historial válido, revisar arquitectura explícitamente; nunca truncar silenciosamente ni introducir persistencia analítica sin decisión nueva.

Fixtures futuros: señales cruzadas, deload, modos/implementos, referencias posteriores/simultáneas, duplicados, varias sesiones y medianoche; métricas custom/constantes/binarias/archivadas; comidas posteriores, tiempos legacy y macros ausentes; correcciones, fallos parciales, aislamiento y clientes antiguos. Escala con perfiles crecientes. Simulaciones nulas autocorrelacionadas, tendencias espurias, cambio de rutina y múltiples candidatos con semillas reproducibles.

No se ejecutaron estas validaciones de Insights. No consultar datos personales para suplirlas.

## Próximo paso

Revisar esta propuesta y cerrar la política de riesgo/calibración. Implementar solo tras autorización expresa de la etapa correspondiente. Mantener #380 en borrador hasta su QA física; no repetir sus pruebas ni compilar/instalar Diario como parte de esta continuidad.
