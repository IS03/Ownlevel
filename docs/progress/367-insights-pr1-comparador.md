# Insights #367 — PR 1: comparación factual

Alcance autorizado el 02/11/2026: kernel puro y optativo, referencias cronológicas y composición por sesión/día. Método **`insights-performance/1`**, entrada pública `buildPerformanceInsightsV1` en `src/lib/progress/performance-insights`. La propuesta de Etapa 0 y el handoff se consultaron desde `origin/codex/367-insights-stage-0-plan`; sus etapas futuras no quedan aprobadas por este PR. Referencias: [#367](https://github.com/IS03/Ownlevel/issues/367), [contratos vigentes de Progress V2](../progress-v2.md).

## Entrada y compatibilidad histórica

La función recibe sesiones y cobertura histórica declarada (`complete`, `partial`, `unavailable`), sin I/O, reloj, catálogo actual ni dependencias de React/Next/Supabase. Reutiliza únicamente la tabla pura de estrategias de `mobile-api/weight-modes.ts`. Es el punto compartido previsto para futuros consumidores Web/API; **ningún consumidor legacy adopta este método en este PR**.

- Identidad por UUID de ejercicio, nunca por nombre/rutina. La rutina histórica se conserva en el resultado para inspeccionar composición.
- Modo, unidad, implemento y configuración deben ser históricos y explícitos. `null` significa desconocido, incluso cuando ambos lados lo tienen. Configuración/implemento son identidades opacas: no se fusionan por similitud ni se normalizan sus significados. El modo admite la normalización de escritura ya existente.
- Una configuración sin variantes puede usar una identidad explícita como `none` **solo si su ausencia se conoce históricamente**. El futuro adapter no puede inventarla ni obtenerla del catálogo vigente. Si los snapshots actuales no acreditan contexto necesario, corresponde insuficiencia; no se agrega persistencia ni un adapter en este PR.
- Sesiones activas/descartadas no participan. Un ejercicio incompleto, sin series completadas o con una serie completada inválida conserva el motivo y no se clasifica usando un subconjunto silencioso. Series sin completar quedan enumeradas fuera de la comparación.
- Repeticiones: enteros no negativos; carga kg: finita no negativa; lingotes: enteros no negativos; tiempo: segundos finitos no negativos. No hay conversiones, factores por mancuerna/brazo ni e1RM. En peso corporal/tiempo el modo declara que no se compara carga externa; `null` o cero en ese campo no se imputa como una carga observada. Una carga externa positiva no está soportada por esas estrategias.

## Cinco resultados y evidencia

| Estado | Regla de esta versión |
| --- | --- |
| `improved` | Hay deltas directos positivos, ninguno negativo y ningún registro sin ancla compatible. |
| `observed_stable` | Hay evidencia directa equivalente, todos sus deltas son cero y ningún registro queda sin ancla. |
| `declined` | Hay deltas directos negativos, ninguno positivo y ningún registro sin ancla compatible. |
| `ambiguous_evidence` | Señales cruzadas, registros sin ancla o ausencia de una señal directa con contexto compatible. |
| `insufficient_comparison` | Contexto, referencia, lifecycle o datos necesarios insuficientes; motivo explícito. |

En kg/lingotes se reúnen **todas** las anclas compartidas: mejor cantidad de reps a cada carga y mayor carga a cada cantidad de reps. La evidencia conserva valores, delta, ancla e IDs de las series que sostienen esos máximos. Cada serie debe compartir carga o reps con alguna del otro lado; una ancla de cero reps no acredita levantar carga. Señales positivas y negativas se concilian antes de clasificar. Más carga con menos reps, o ambas dimensiones cambiadas sin ancla directa, quedan ambiguas. No se elige retrospectivamente la señal más favorable.

Es una comparación de mejores registros por ancla, no un emparejamiento ordinal de series ni una medida del esfuerzo total. En peso corporal se compara el mejor registro de reps; en tiempo, el mejor registro de segundos. Igualdad de esos mejores registros es estabilidad observada de esa evidencia; cambios de cantidad de series/volumen no desempatan. Descenso describe registros inferiores, sin demostrar pérdida de capacidad: programación, deload y esfuerzo real desconocido limitan la interpretación. No existe RIR realizado en esta entrada.

Récords se calculan en un carril separado contra el historial compatible, válido y estrictamente anterior **provisto**, con su cobertura declarada. No afirman un récord absoluto si el historial es parcial. Sin historia no se inventa un récord inicial; sin reps realizadas no se acredita récord de carga. Un récord de carga puede coexistir con clasificación ambigua. Volumen también queda separado por ejercicio/contexto: kg×reps, lingotes×reps, reps o segundos. No se suman unidades/ejercicios como fuerza.

## Referencias y duplicados

Se elige la última exposición de contexto compatible cuya sesión finalizó **estrictamente antes** del inicio evaluado. Puede ser del mismo día. Timestamps deben tener offset/Z, fechas reales e intervalo positivo, con procedencia `verified`; se preserva precisión submilisegundo. Sesiones posteriores, simultáneas, solapadas o de cronología incierta quedan excluidas con motivo. Empates entre los finales más recientes producen abstención, no desempate por UUID o resultado. La referencia conserva `endedAt`, exposición, series y `ageMs`; no caduca automáticamente a los 28 días.

La selección no depende del rendimiento ni salta una referencia compatible con series incompletas/inválidas para elegir una más antigua favorable: conserva esa referencia y devuelve insuficiencia. Contextos desconocidos, mezclados o incompatibles quedan separados.

Un ejercicio cuenta una vez por sesión. Lecturas idénticas de una misma sesión/bloque/serie se deduplican por ID; bloques reales distintos de un ejercicio solo se reúnen con contexto compatible. Series distintas con los mismos valores conservan su identidad y volumen. Mezclas de contexto o duplicados contradictorios dentro del ejercicio producen insuficiencia. Versiones contradictorias de una misma sesión invalidan el lote (`integrity=conflicting_duplicates`, exclusiones explícitas): arrays vacíos en ese estado **no** significan historial vacío. El consumidor futuro debe comprobar integridad y cobertura antes de usar resultados.

## Composición diaria candidata

Por sesión y día se conservan las cinco cantidades, ejercicios/exposiciones y referencias, rutina, exclusiones, total y:

```text
C = mejoras + estabilidades observadas + descensos
cobertura = C / total de ejercicios observados
proporción candidata diaria = suma(descensos) / suma(C)
sensibilidad con igual peso por sesión = promedio(descensos_s / C_s), solo C_s > 0
```

Ambigüedad e insuficiencia quedan fuera de C, dentro del total y del detalle. Cobertura es `null` si no hay ejercicios observados; con ejercicios pero C=0 es cero. Ambas proporciones son `null` si no hay comparaciones evaluables. Cero descensos con C>0 es un cero real.

Se emite una fila por **día lógico suministrado desde el day log**, sin inferirlo de la fecha UTC del entrenamiento. Fecha ausente/imposible impide agregación diaria, conserva la sesión y registra la exclusión. Dos sesiones reales pueden comparar el mismo ejercicio en un día y aportar dos comparaciones al denominador; permanecen identificadas. El día es una sola unidad futura para emparejar métricas, no dos observaciones independientes. Cambios de rutina/composición y diferencias entre las dos fórmulas permanecen visibles. Estas proporciones son candidatas metodológicas descriptivas; **no habilitan asociaciones ni patrones personales**.

## Validación y límites de entrega

- 66 fixtures sintéticos: cinco estados, señales cruzadas, máximos/anclas, récord separado, modos/unidades/implementos/configuración, historia incompleta, cero/missing, lifecycle, cronología anterior/simultánea/posterior/incierta y submilisegundo, antigüedad, duplicados, múltiples sesiones, medianoche, composición y denominadores, determinismo y no mutación.
- `npm test -- src/lib/progress/performance-insights/kernel.test.ts`: 66/66.
- Regresión focalizada ya ejecutada: `training-performance.test.ts` (11), `relationships/training.test.ts` (2), `training-session-summary.test.ts` (7), `training-session-highlights.test.ts` (19): 39/39. Sin cambios en esos consumidores, sus imports o sus tests.
- `npx tsc --noEmit --incremental false` y `npx eslint src/lib/progress/performance-insights`: correctos.
- Windows: dependencias solo de raíz instaladas con `npm ci --no-audit --no-fund` desde el lock vigente, sin cambios de paquetes/locks. Node v22.18.0/npm 11.5.2, compatibles con los checks de dominio; no se instaló el árbol Expo ni se intentó reproducir su toolchain nativo.
- Codebase Memory expuso búsquedas vacías y no permitió acreditar revisión/frescura; se usaron fuentes dirigidas del checkout `145c0d3`. No se reconfiguró el MCP.

No hay migraciones, endpoints, loaders, UI, capturas, journal, datos personales, secretos, builds nativos, instalaciones de Diario ni cambios de producción. #380 queda fuera del diff y no se modifica/mergea. No se integran ramas históricas o WIP. El kernel prepara exposiciones una vez e indexa candidatos por ejercicio; todavía recorre su historial para evidencia/exclusiones. Este PR no mide ni garantiza costo all-time/latencia/CPU: presupuestos y lectura agrupada corresponden al trabajo futuro autorizado por separado.

Las etapas 2–5, sensaciones pre/post, temporalidad alimentaria, promoción/calibración y adopción Web/Expo siguen pendientes de autorización específica. El objetivo del 1 % permanece una **hipótesis de calibración futura**, sin medición, garantía ni etiqueta de patrón consistente. Próximo paso: revisión metodológica y de código de este PR; no iniciar la siguiente etapa ni mergear automáticamente.
