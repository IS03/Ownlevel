# #367 — Resumen factual post-entreno

Completa lo que faltaba para entender una sesión recién terminada. Solo presentación, más un campo de contrato opcional. **Sin migración, sin cambio de método, sin asociaciones nuevas y con «consistente» deshabilitado.**

## Qué existía y qué faltaba

**Ya existía**
- **Resumen post-entreno:** recibo durable, `routineAdditions`, estados por ejercicio, sensaciones y el botón «Comparar en Insights». El botón abre los hechos de esta sesión con la sesión de origen y la fecha, sin leer nada al terminar.
- **Vista de la sesión en Insights:** lecturas del comparador compartido y sensaciones de la sesión.

**Faltaba o era impreciso**
1. **Regla de las marcas:** las marcas del resumen («récord», «↗ 2 kg», «=», «primera vez») salen de `exerciseComparison`, otra regla. Compara la última vez con el mismo modo de carga, sin implemento ni variante. Se mostraban sin decirlo.
2. **Conteos mezclados:** Insights sumaba «Mezclado» y «Sin comparar» en una sola fila.
3. **Un solo método:** la vista de la sesión mostraba solo el método principal. Si la sesión tenía ejercicios en los dos, el otro no aparecía con sus conteos.
4. **Referencia sin fecha:** la referencia compatible no tenía fecha, solo «hace N días» en el texto leído por VoiceOver.
5. **Sensaciones como números:** aparecían como «4 de 5» en Insights y como una etiqueta suelta por respuesta en el resumen. No había un antes → después.

## Qué cambió

- **Marcas del resumen:** debajo de «Ejercicios», cuando hay marcas, dice: «Frente a la última vez con el mismo modo de carga. Insights compara además implemento y variante, y puede leer distinto».
- **Conteos de Insights:** «Mezclado» y «Sin comparar» son filas separadas, en cada método con sus palabras.
- **Vista de una sesión:**
  - cada método va en su sección, con su propio denominador («1 de 1 ejercicios comparables con contexto parcial») y el límite del parcial;
  - nunca se suman.
- **Referencia compatible:** cada ejercicio comparado dice «Frente al martes 3 de marzo». VoiceOver lee «…, frente a la sesión del martes 3 de marzo». Un ejercicio sin comparar dice por qué.
- **Contrato:**
  - `referenceDate`, opcional en `ExerciseFact` y `PartialExerciseFact`: la fecha lógica de la sesión de referencia;
  - una respuesta sin el campo se sigue leyendo, y una con un valor mal formado se rechaza;
  - sin consultas nuevas: la fecha sale de las sesiones ya leídas.
- **Sensaciones ordinales** (`feeling-transition.ts`, compartido): «Energía: baja → alta», «Fatiga: moderada → sin registrar».
  - **Sin registrar, ilegible y tardía** quedan distintas.
  - **En Insights:** «Antes: respondida después de empezar».
  - **En el resumen post-entreno:** no se conoce la hora de la primera serie. Solo dice «sin hora de respuesta», «respondida después de iniciar la sesión» o «respondida al terminar».
  - Sin números, promedios ni puntaje.
- **Lo que no cambia:**
  - terminar no espera ningún análisis y no lee Insights;
  - un error del resumen no toca el finish confirmado;
  - recibos y `routineAdditions` se mantienen.

## Equivalencia

**Huella de #407** (`equivalence-fingerprint.test.ts`, con la nueva opción `INSIGHTS_FINGERPRINT_OMIT`):
- omitiendo `referenceDate`, **53 de 53** vistas son idénticas a main;
- con el campo, cambian solo las 23 que contienen referencias.

## Validación

- **Pruebas nuevas:**
  - modelo: filas separadas, métodos por sesión, texto de la referencia, sensaciones ordinales;
  - vista de la sesión abierta desde el post-entreno: dos métodos con sus denominadores, referencia con fecha, sensaciones ordinales con captura tardía, sin porcentajes ni causas;
  - resumen post-entreno: rótulo de la regla, sensaciones ordinales con su horario, sin respuestas;
  - motor y contrato: `referenceDate` igual a la fecha de la sesión de referencia en los dos métodos, opcional y validado.
- **Pruebas ajustadas:**
  - las del contexto diario, al formato ordinal;
  - la de memoria, que reconstruye los hechos con la fecha.
- **Pruebas que pasan:**
  - motor, comparador y contrato: 376;
  - Mobile, Insights y post-entreno: 82.
- **Tipos y lint:** sin errores en Web y Mobile.

## Pendientes

- **Mobile:** requiere build. La QA física está diferida, en la [lista única](367-qa-fisica.md).
- **Conteo propio de Insights en el resumen:** mostrar los conteos de Insights dentro del resumen post-entreno requeriría leer toda la historia al terminar. No se hace: Insights se abre con un toque.
- **Hora de la primera serie:** el detalle de la sesión no la trae, así que el post-entreno no puede decir si una previa fue antes de la primera serie.

Previews bloqueadas para `codex/367-post-workout-summary` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
