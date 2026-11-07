# #367 — Energía y fatiga al terminar como resultados

Método `insights-feeling-outcomes/1` (`src/lib/progress/insights-engine/feeling-outcomes.ts`). Se fijó antes de mirar resultados. Comparte el motor de asociaciones y su política con el rendimiento (`associations.ts`). **Las asociaciones no se publican:** la validación de abajo no pasa. Se publica solo la descripción, en `view=feelings`.

## Qué es cada resultado

- **Dos resultados, cada uno con su familia:**
  - energía al terminar (`energyPost`);
  - fatiga al terminar (`fatiguePost`).
- **Escala:** la respuesta ordinal 1–5 del instrumento `energy-fatigue/1`, con sus anclajes:
  - energía: muy baja, baja, media, alta, muy alta;
  - fatiga: ninguna, poca, moderada, mucha, muchísima.
- **Lo que no se hace:**
  - invertir la energía para obtener fatiga, ni al revés;
  - sumarlas, promediarlas o hacer un puntaje;
  - tomar la diferencia antes → después como una cantidad continua.
- **Otro instrumento** es otra escala: se cuenta aparte (`otherInstrument`) y nunca se lee con estos anclajes.
- **La energía del flujo anterior** (`workout_sessions.energy_level`) no dice el momento. Nunca se lee como energía al terminar: se cuenta aparte (`legacyEnergyOnly`).

## Unidad, elegibilidad, temporalidad y dependencia

- **Unidad:** el día lógico cerrado con exactamente una sesión terminada.
  - **Por qué:** las exposiciones son valores del día (métricas, nutrición, sueño, peso). Contar cada sesión de un día repetiría la misma exposición como si fueran observaciones independientes.
  - Un día con varias sesiones queda afuera (`multiple_sessions_day`), igual que en las sensaciones previas.
- **Elegibilidad del día**, en este orden:
  1. el día ya cerró (`day_still_open`);
  2. tiene una sola sesión (`multiple_sessions_day`);
  3. la respuesta al terminar es legible, del instrumento vigente, y se capturó al terminar (ver temporalidad);
  4. la respuesta previa del mismo tipo es comparable: legible y capturada antes del inicio o de la primera serie. Si no, queda afuera con su motivo (`prior_not_recorded`, `prior_unreadable`, `prior_capture_unknown`, `prior_after_first_set`).
- **Temporalidad de la respuesta al terminar:**
  - cuenta si se capturó entre el inicio y dos horas después del final (`POST_CAPTURE_GRACE_HOURS`);
  - más tarde es otra cosa: un recuerdo. Se cuenta como «respondidas más tarde»;
  - sin hora o sin final de sesión queda como «sin hora»;
  - antes del inicio es imposible para una respuesta al terminar, y se cuenta aparte;
  - el reloj es el del cliente, sin verificar, como en las previas.
- **Contexto de interpretación:** la respuesta previa del mismo tipo es el estrato.
  - El resultado del día es su respuesta al terminar, ordenada entre los días que empezaron en el mismo nivel (`stratifiedRows`). Se usan rangos medios y una proporción en (0, 1).
  - Terminar «alta» después de empezar «baja» no se lee igual que después de empezar «alta». Un nivel visto una sola vez da 0,5: no dice nada.
  - Las previas nunca son exposiciones de estos resultados: probarlas sería probar el resultado contra su propio marco.
- **Dependencia:**
  - una fila por día;
  - el motor quita la tendencia local de 28 días y permuta por bloques de 14 días, igual que en el rendimiento;
  - la familia se corrige con el máximo de todos sus candidatos.

## Candidatos

- **Los mismos de la tabla de exposiciones del rendimiento (método 2):**
  - métricas del día y del anterior;
  - nutrición del día y del anterior;
  - carbohidratos en las 3 h previas y antes del inicio, con hora explícita;
  - peso del día;
  - sueño con noche declarada y sus ventanas sin declarar.
- **Sin la familia «feeling».**
- **Ids con prefijo** `feeling_outcome:<resultado>:`. Cada resultado es su propia familia.
- **Familia ampliada:** estos dos resultados se suman a las comparaciones de Insights. La calibración del rendimiento no se reutiliza.

## Calibración (`feeling-calibration.ts`)

**Cómo se midió:**
- corre el mismo `stratifiedRows` y el mismo `evaluateAssociations` sobre historiales sintéticos;
- 24 meses, unas 355 filas al final, 12 actualizaciones en el último año, 12 candidatos y 199 permutaciones;
- 500 historiales por escenario, semilla `0x367f`;
- **un historial cuenta si algún candidato pasa en cualquiera de los dos resultados**, en cualquier actualización;
- los supuestos están en el archivo y son supuestos, no datos de nadie.

**Reproducir:** `INSIGHTS_FEELING_CALIBRATION_OUT=<archivo> INSIGHTS_FEELING_CALIBRATION_HISTORIES=500 npx vitest run src/lib/progress/insights-engine/feeling-calibration.test.ts`. Unos 2 minutos por escenario.

| Escenario | Algún exploratorio | Compuerta estricta | Wilson sup. 95 % | Energía | Fatiga |
| --- | --- | --- | --- | --- | --- |
| Independiente | 7,2 % | 0,4 % | 1,45 % | 0,2 % | 0,2 % |
| Dependencia temporal | 18,4 % | 0,6 % | 1,75 % | 0,4 % | 0,2 % |
| Cambios de rutina | 72,0 % | **7,2 %** | **9,81 %** | 4,6 % | 3,0 % |
| Tendencias espurias | 69,6 % | **6,2 %** | **8,67 %** | 3,4 % | 2,8 % |
| Ausencia selectiva | 6,4 % | 0,2 % | 1,12 % | 0,2 % | 0 % |
| Exposición que sigue a la previa | 7,0 % | 0,4 % | 1,45 % | 0 % | 0,4 % |
| Efecto moderado plantado | 100 % | 100 % | — | 99,8 % | 100 % |
| Efecto fuerte plantado | 100 % | 100 % | — | 100 % | 100 % |

**Lo que muestra:**
- **El estrato cumple su función.** Una exposición que solo sigue a la energía previa pasa la compuerta en 0 % con estrato y en 100 % sin él.
- **El presupuesto no se cumple en ningún escenario.** El candidato del presupuesto es 1 % por historial (`INSIGHTS_RISK_BUDGET_CANDIDATE`), y la cota de Wilson queda arriba aun en los nulos:
  - independiente, 1,45 %;
  - dependencia temporal, 1,75 %;
  - cambios de rutina y tendencias, entre 6 % y 7 %, con cotas cercanas al 10 %. Es cuatro veces más que en el rendimiento: dos resultados juntos y una escala con empates amplifican la deriva.
- **La potencia es alta** con los efectos plantados, pero eso no compensa los falsos positivos.

**Decisión: no se publican.** La vista dice `associations: { status: "not_published", reason: "validation_pending" }`. El carril queda interno (`snapshot.feelingOutcomes[].lane`), sin ninguna vista que lo exponga.

**Para volver a intentarlo**, cada cambio es un cambio de método con su propia calibración. Ninguno se ajusta mirando datos de nadie:
- **permutaciones dentro de cada era de rutina**, o la rutina como estrato además de la previa;
- **una ventana de tendencia local más corta**, o diferencias sobre la media móvil;
- **una corrección conjunta de los dos resultados:** el máximo de ambas familias en la misma permutación;
- **mostrar los dos resultados juntos como una sola familia** al publicarlos.

## Qué se publica (`view=feelings`)

- **Por resultado:**
  - sesiones terminadas, contestadas, sin respuesta, ilegibles y de otro instrumento;
  - captura: al terminar, más tarde, sin hora, antes del inicio;
  - procedencia: Mobile, Web o desconocida;
  - las respuestas al terminar, por nivel previo, y las que no tienen una previa comparable, con su motivo;
  - fechas extremas;
  - días que usarían las asociaciones y sus exclusiones;
  - la energía del flujo anterior, aparte.
- **El contrato rechaza una descripción cuyas partes no suman el total.**
- **Sin promedios, porcentajes, diferencias ni puntajes.** Toda la historia junta: sin período, filtro ni página que permita elegir dónde mirar.
- **La vista sale del mismo snapshot** que el resto: no hay lecturas nuevas.
- **Clientes instalados:** nunca piden esta vista, y las demás no cambian.
