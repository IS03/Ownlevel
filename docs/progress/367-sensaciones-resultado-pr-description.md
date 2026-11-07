# #367 — Energía y fatiga al terminar como resultados

Energía y fatiga al terminar pasan a ser dos resultados propios, además del contexto que ya eran. **Se publica su descripción. Sus asociaciones no se publican ni se preparan en las vistas:** la calibración nueva no alcanza el objetivo de validación propuesto, y el cálculo experimental solo se construye si se pide expresamente. También se documenta la hoja de ruta del ecosistema. **Sin migración. Sin cambios en las vistas existentes. «Consistente» sigue deshabilitado.**

## Qué cambió

- **Método** (`insights-feeling-outcomes/1`, `feeling-outcomes.ts`), definido antes de mirar resultados. Detalle en [367-sensaciones-resultado-metodo.md](367-sensaciones-resultado-metodo.md):
  - **unidad:** el día cerrado con una sola sesión, para no repetir los valores del día por cada sesión;
  - **escala:** ordinal 1–5 de `energy-fatigue/1`, con sus anclajes. Sin invertir la energía para obtener la fatiga, sin sumarlas, sin puntaje y sin tratar la diferencia antes → después como una cantidad;
  - **previa como contexto:** el resultado se ordena dentro de su nivel previo del mismo tipo. La previa nunca es exposición;
  - **temporalidad:** la respuesta al terminar cuenta si se capturó entre el inicio y 2 h después del final. Las tardías, sin hora o imposibles se cuentan aparte;
  - **lo que se preserva:** instrumento, procedencia (Mobile o Web), respuestas ilegibles, faltantes y energía heredada, que nunca se lee como energía al terminar;
  - **candidatos:** la tabla de exposiciones del rendimiento sin la familia «feeling». Cada resultado es su propia familia.
- **Motor** (separado en #412):
  - `describeFeelingOutcome`: conteos y estados, lo único que construye y guarda el snapshot (`snapshot.feelingOutcomes`);
  - `prepareFeelingAssociations`: días ordenados, tabla de exposiciones, candidatos y evaluación. Es experimental y solo se construye al pedirlo, en pruebas o calibración. Ninguna vista lo usa.
- **Contrato:**
  - vista nueva `view=feelings`, compatible: los clientes instalados no la piden;
  - el parser rechaza una descripción cuyas partes no suman el total;
  - las demás vistas no cambian.
- **Ruta:**
  - la vista sale del mismo snapshot cacheado, sin lecturas nuevas;
  - no acepta período, página ni filtro.
- **Mobile:** «Cómo terminaste» en Insights abre una pantalla con una lectura.
  - **Una sección por sensación**, con una fila por nivel previo: «Antes: alta · 2 sesiones», y debajo «Al terminar: muy alta 1 · alta 1».
  - **Aparte**, las que no tienen una previa comparable y las que quedan fuera de las cuentas, con su motivo.
  - **Sin promedios, porcentajes ni puntajes.** Al pie dice que las coincidencias todavía no se muestran.
- **Documentación:**
  - [hoja de ruta del ecosistema](367-hoja-de-ruta-ecosistema.md): alimentación y tiempo con tres candidatos iniciales justificados, evolución corporal semanal y resúmenes de 3 meses;
  - matriz actualizada, con los estados viejos corregidos: #410 y #411 mergeados, y la configuración del ejercicio aplicada y desplegada;
  - checklist única de QA.

## Calibración nueva (solo de estos resultados)

`feeling-calibration.ts` corre el mismo `stratifiedRows` y el mismo `evaluateAssociations`. Midió 500 historiales por escenario, 24 meses, 12 actualizaciones, 12 candidatos y 199 permutaciones. Un historial cuenta si pasa cualquiera de los dos resultados.

| Escenario | Compuerta estricta | Wilson sup. 95 % |
| --- | --- | --- |
| Independiente | 0,4 % | 1,45 % |
| Dependencia temporal | 0,6 % | 1,75 % |
| Cambios de rutina | **7,2 %** | **9,81 %** |
| Tendencias espurias | **6,2 %** | **8,67 %** |
| Ausencia selectiva | 0,2 % | 1,12 % |
| Exposición que solo sigue a la previa | 0,4 % (candidato confundido: 0 %; sin estrato: 100 %) | 1,45 % |
| Efectos plantados, moderado y fuerte | 100 % detectado | — |

- **El estrato funciona:** sin él, una exposición que solo sigue a la previa pasaría siempre.
- **No se publica.** El 1 % es el **objetivo de validación propuesto, no una tolerancia aprobada**. La cota de Wilson lo supera en todos los escenarios, y con cambios de rutina y tendencias queda cerca del 10 %.
- **En esta tanda no se intentó habilitarlas** ni se ajustaron umbrales. Los cambios posibles están en el documento de método; cada uno es un método nuevo con su propia calibración.
- **No se repitieron** las calibraciones del rendimiento: su política y sus candidatos no cambiaron.

## Revisión de #412: descripción separada del análisis experimental

- **Antes:** `createInsightsSnapshot` llamaba dos veces a la preparación completa. Ordenaba los días, construía una tabla de exposiciones y los candidatos de cada resultado, y los retenía en el snapshot, aunque nada de eso se publica.
- **Ahora:** el snapshot guarda solo la descripción. La preparación experimental es una función aparte.
- **Regresión:** construir el snapshot y servir todas las vistas llama a `buildExposureTable` solo para los dos carriles de rendimiento. La descripción guardada es exactamente la publicada, sin campos analíticos.
- **Equivalencia** con `721c27a`, sobre 8 resultados, 2171 días y 166 evaluaciones de candidatos: descripción, días, candidatos y evaluación idénticos. Solo se quitó `associations.candidates`, que necesitaba la tabla. La calibración no se repitió: usa el mismo `stratifiedRows` y la misma evaluación.
- **Costo** (5 años, 1311 sesiones con las cuatro respuestas, método 2, mediana de 7):

  | Versión | Construcción | Retenido por snapshot |
  | --- | --- | --- |
  | `main` | 245 ms | 7,2 MiB |
  | Antes de #412 | 323 ms | 19,1 MiB |
  | Con #412 | 233 ms | 7,2 MiB |

## Validación

- **Pruebas nuevas:**
  - **motor:** sin preparación de asociaciones en el snapshot ni en las vistas (#412); conteos por nivel previo; capturas tardías, sin hora, ilegibles y de otro instrumento; energía heredada aparte; una sensación no cambia la otra; una fila por día y exclusiones; rangos dentro del estrato; familia sin previas y sin publicar;
  - **contrato:** rechaza descripciones cuyas partes no suman, la energía heredada en la fatiga, asociaciones marcadas como publicadas y el orden invertido;
  - **calibración:** reproducible, detecta un efecto plantado, y el estrato frena el confundido;
  - **ruta:** mismo snapshot y misma revisión, una sola lectura del contador, rechaza parámetros;
  - **Mobile:** una lectura, filas por nivel previo en palabras, el aparte, la energía heredada, lectura fallida y estado vacío.
- **Pruebas que pasan:**
  - Web (motor, comparador, contrato y ruta): 404;
  - Mobile Insights: 37 en las suites afectadas por #412 (46 en la primera entrega).
- **Tipos y lint:** sin errores en Web y Mobile.

## Pendientes

- **Asociaciones:** un método que pase la calibración con cambios de rutina y tendencias. Recién después se decide publicarlas.
- **Mobile:** requiere build. La QA física está diferida, en la [lista única](367-qa-fisica.md).
- **Fases 2 a 4** de la hoja de ruta: solo diseño.

Previews bloqueadas para `codex/367-feeling-outcomes` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
