# #367 — Energía y fatiga al terminar: método experimental estratificado

Segundo método experimental para las asociaciones de energía y fatiga al terminar, preregistrado, con escenarios de desarrollo separados de una validación reservada. **No valida y queda experimental, fuera de las vistas.** Sin migración. Ningún método existente cambia. «Consistente» sigue deshabilitado y el 1 % sigue siendo un objetivo propuesto.

Método, preregistro, desarrollo y validación: [367-sensaciones-estratificado-metodo.md](367-sensaciones-estratificado-metodo.md).

## Orden de los commits

1. `185e5fc`: **preregistro**, antes de cualquier código o simulación.
2. `488ea69`: método y simulación desde filas fuente.
3. `71ebf36`: **resultados de desarrollo**, escritos antes de correr la validación reservada.
4. Validación reservada: una sola corrida con el código de `488ea69`, y estos documentos.

## Qué cambió

- **Método** (`insights-feeling-stratified/1`, `feeling-stratified.ts`):
  - usa las filas y los candidatos de `prepareFeelingAssociations` (#412), sin cambios: unidad, elegibilidad, exclusiones y control de la sensación previa;
  - cambia la evaluación: correlación de Spearman tomada dentro de estratos de rutina registrada × bloque de calendario de 42 días;
  - permutaciones solo dentro de cada estrato, con el máximo de la familia por resultado, y el umbral estricto partido entre energía y fatiga (0,005);
  - energía y fatiga siguen ordinales y separadas, sin promedios ni puntajes.
- **Simulación desde filas fuente** (`feeling-stratified-calibration.ts`):
  - sesiones con su rutina, sensaciones con su instrumento y su hora de captura, y métricas diarias;
  - recorrido `buildExposureContext` → `prepareFeelingAssociations` → método;
  - el método de #412 se evalúa sobre las mismas filas, como comparación.
- **Nada se publica:** ninguna vista ni el snapshot lo llaman.

## Evidencia (validación reservada, 500 historiales por escenario)

| Escenario | Nuevo: estricta | Wilson 95 % | #412 |
| --- | --- | --- | --- |
| Independiente | 2,0 % | 1,09–3,64 % | 0,4 % |
| Dependencia temporal | 2,6 % | 1,53–4,40 % | 1,0 % |
| Tendencia | 1,6 % | 0,81–3,13 % | 4,6 % |
| Cambio de rutina registrado | 1,8 % | 0,95–3,39 % | 4,8 % |
| Cambio sin registrar | 3,2 % | 1,98–5,13 % | 5,0 % |
| Rutinas alternadas | 2,0 % | 1,09–3,64 % | 100 % |
| Ausencia selectiva | 2,0 % | 1,09–3,64 % | 0,8 % |
| Horarios inciertos | 4,0 % | 2,60–6,10 % | 2,0 % |
| Inversa del mismo día (limitación) | 85,8 % | — | 90,6 % |
| Efecto moderado (potencia) | 96,4 % | — | 98,6 % |

- **No valida:** las cotas superiores de los ocho nulos quedan por encima del 1 %.
  - En **seis**, el límite inferior también supera el 1 %, contando horarios inciertos. Con esta evidencia, la tasa del método está arriba del objetivo.
  - En **tendencia y cambio de rutina registrado**, el intervalo incluye el 1 %. La evidencia es insuficiente para ese objetivo: no confirma ni descarta que lo alcancen.
- **Redujo los falsos positivos en ciertos escenarios de confusión**, sin validar: rutinas alternadas, 100 % → 2,0 %; tendencias y cambios registrados, cerca de 5 % → menos de 2 %.
- **Empeoró el nulo sin confusión:** independiente, 0,4 % → 2,0 %. Probablemente por una compuerta con menos controles que la de #412 y por las 12 miradas sin corregir; no se comprobó.
- **Pérdida de cobertura:** por estratos chicos, menos del 1,2 %. Las respuestas tardías excluidas bajan las filas un 25 %, y esa exclusión, que depende del resultado, sube los falsos positivos.
- **Potencia:** casi igual a la de #412.
- **Pruebas:** 5 pruebas del método (estratos, pérdida, reproducibilidad, recorrido real y efecto plantado); tipos y lint sin errores. Ningún archivo existente de código cambió.

## Revisión de #417

Solo cambian las conclusiones; cifras, preregistro y decisión siguen iguales, y no se corrió nada nuevo:
- «resolvió la confusión» pasa a «redujo los falsos positivos en ciertos escenarios, sin validar»;
- son seis los nulos con límite inferior por encima del 1 %, contando horarios inciertos;
- en tendencia y cambio registrado los intervalos incluyen el 1 %: la evidencia es insuficiente, no un rechazo definitivo.

## Límites

- Todo es simulado: los supuestos están en el código y no son datos de nadie.
- La simulación usa 199 permutaciones; la resolución del umbral estricto es justo 0,005.
- La relación inversa del mismo día no se puede corregir con ningún estadístico: es de la definición del candidato.

## Pendientes

- Las opciones para un próximo método están en el documento. Cada una necesita su preregistro y su validación reservada.

Previews bloqueadas para `codex/367-feeling-stratified` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
