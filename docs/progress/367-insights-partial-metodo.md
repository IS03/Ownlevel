# Insights #367 — Método parcial `insights-performance-partial/1`

Sobre [PR 4](367-insights-pr4-motor.md) (#385). **Es otro método, no un ajuste de `insights-performance/1`**, que conserva su semántica. Asociaciones: `insights-engine-partial/1`. Sin migraciones ni escritura de datos: ejecuta solo lectura.

Existe porque la configuración histórica (agarre, banco, posición) nunca se capturó. Con el método estricto, todo el historial queda en `missing_context`.

## Reglas

| Regla | Detalle |
| --- | --- |
| Compara | Mismo UUID, modo, unidad e implemento históricos, con configuración desconocida en ambos lados |
| Nunca compara | Conocida contra desconocida; modo, unidad o implemento faltantes o distintos |
| Nunca hace | Completar datos desde el catálogo vigente, escribir `none`, reconstruir historia |
| Dice | «Registro superior, igual o inferior con contexto parcial». Una asociación que pasa la compuerta solo es una coincidencia: `coincidence_context_unknown` |
| No dice | Mejora, descenso, capacidad, fuerza ni causa, tampoco energía o comida como explicación. Esas palabras no existen en el carril: `higher_record`, `same_record`, `lower_record` |
| Máximos | `highestInPartialContext`, separados de los récords estrictos |
| «Consistente» | Imposible: `promotion.status = not_enabled`, motivo `partial_context` |

## Partición: una observación nunca se cuenta dos veces

Cada ejercicio de cada sesión cae de un solo lado:

- **Alguna configuración conocida** en cualquiera de sus bloques → solo método estricto.
- **Toda desconocida** → carril parcial.

`partial.partition` da `total`, `configurationKnown` y `configurationUnknown`, y el contrato rechaza una suma que no cierre. Se cuenta sobre las mismas sesiones que los métodos, sin filas repetidas, y queda en cero si el historial es contradictorio.

**Denominadores.** `facts.totals.total` sigue contando todas las exposiciones: su semántica no cambió, y las desconocidas figuran allí como `missing_context`. `partial.totals.total` cuenta solo las desconocidas. `comparable` es disjunto entre métodos; **`total` no se puede sumar**. La UI no suma ninguno.

## Contrato

Carril `partial`, en `performance-insights/1`, que sigue sin consumidores publicados. Sin sus rótulos, el contrato rechaza toda la lectura. Un carril parcial no puede traer el estado `exploratory`, y uno estricto no puede traer `coincidence_context_unknown`.

| Campo | Contenido |
| --- | --- |
| `methodVersion`, `engineMethodVersion`, `contextCompleteness` | Identifican el método; `configuration_unknown` |
| `partition`, `outcomeDays` | Denominadores propios |
| `totals`, `exercises`, `days` | Mismas fechas y paginación que `facts.days`, con conteos propios. El contexto del día sigue en `facts` y no pertenece a ningún método |
| `associations` | Familia propia con ids `partial:...`, resultado `daily_lower_record_proportion` y corrección solo sobre sus candidatos |
| `exclusions` | Por ejercicio y por día |

`association=partial:<id>` trae esa relación con sus pares; el id sin prefijo trae la del estricto.

## Calibración

**Estas cifras no se mezclan con la [calibración estricta](367-insights-pr4-motor.md).** Aquella simula el resultado diario directamente. Esta corre el comparador real sobre entrenamientos sintéticos, y luego la misma política de asociaciones.

**Son supuestos, no datos** (el dato real no existe):
- 24 meses, 4 sesiones por semana, 6 ejercicios de un catálogo de 12, 3 series a carga fija y unas 10 repeticiones.
- Una variante no registrada mueve **±2 repeticiones**, con signo fijo por ejercicio, y persiste hasta el próximo cambio.
- 12 candidatos independientes, 20 % de faltantes, 12 lecturas durante el último año, 199 permutaciones, 1000 historiales por escenario.

### Efecto sobre cada lectura

Proporción de lecturas comparables, contra el mismo entrenamiento sin variantes:

| Cambios no registrados por exposición | Cruzan un cambio | Cambian de lectura | Se invierten (superior ↔ inferior) |
| --- | --- | --- | --- |
| 0 % | 0,0 % | 0,0 % | 0,0 % |
| 5 % | 5,0 % | 2,9 % | 1,0 % |
| 15 % | 15,0 % | 8,8 % | 3,2 % |
| 30 % | 30,1 % | 17,5 % | 6,3 % |
| 5 %, más cambio de programa cada 6 meses | 5,6 % | 3,3 % | 1,2 % |

Como cada lectura se compara con la sesión anterior, un cambio persistente contamina una sola lectura. Un cambio de ida y vuelta contamina dos.

### Asociaciones sin efecto real

Historiales con al menos un candidato que pasa, en cualquier lectura del año:

| Escenario | Compuerta estricta interna | Wilson 95 % | Cualquier exploratorio |
| --- | --- | --- | --- |
| Sin cambios | 0,0 % | 0,38 % | 0,9 % |
| Cambios 5 % | 0,0 % | 0,38 % | 0,6 % |
| Cambios 15 % | 0,2 % | 0,73 % | 1,5 % |
| Cambios 30 % | 0,0 % | 0,38 % | 1,0 % |
| Cambio de programa cada 6 meses | 0,0 % | 0,38 % | 0,4 % |

Cambios independientes de la exposición agregan ruido, no asociaciones falsas.

### El límite importante: cambios ligados a la exposición

| Escenario | Compuerta estricta | Wilson 95 % | Exploratorio |
| --- | --- | --- | --- |
| Con la exposición alta se usa una variante más difícil, y solo esa sesión | **44,7 %** | 47,80 % | **77,9 %** |

**El método no puede distinguir esto de un efecto real.** Si en los días de poca energía elegís una variante más fácil sin registrarla, aparece una relación que no viene de la energía. Tampoco hay diagnóstico posible con estos datos: un efecto real y un cambio ligado dejan el mismo rastro en las lecturas. La frecuencia real no se conoce: este escenario no estima cuánto ocurre, muestra qué pasa si ocurre.

**Qué se publica por eso.** Pasar la compuerta en este método no se llama «exploratorio», como en el estricto: se llama `coincidence_context_unknown` y la frase dice que los días coincidieron y que no sabemos si cambió la variante. No puede promoverse, no aparece hasta que se pide la lista y nunca arma una frase con causa. **La compuerta y las cifras de calibración no cambiaron:** cambió lo que se afirma cuando pasa.

### Efecto real plantado

| Escenario | Estricta | Exploratorio |
| --- | --- | --- |
| Efecto de 1 repetición, sin cambios | 100 % | 100 % |
| Efecto de 1 repetición, cambios 15 % | 100 % | 100 % |
| Efecto de 0,2 repeticiones, sin cambios | 1,8 % | 10,1 % |
| Efecto de 0,2 repeticiones, cambios 15 % | 1,8 % | 8,1 % |

A 0,2 repeticiones casi no hay potencia, con o sin cambios: un efecto débil puede pasar desapercibido.

**El objetivo del 1 % sigue sin aprobar**, y estas cifras tampoco lo aprueban para este método.

## Vistas y reutilización

El endpoint ya no manda todo junto. Todas las vistas salen de una misma lectura consistente, identificada por `sourceRevision`.

| Vista | Pedido | Contiene | No hace |
| --- | --- | --- | --- |
| `summary` | Por defecto | Totales, ejercicios, días, contexto y cuántas relaciones hay | Permutaciones |
| `days` | `view=days&before=` | Solo los días pedidos, de ambos métodos | Permutaciones ni reenviar totales |
| `relations` | `view=relations` | Una línea por relación, con estado, pares y días | Enviar estabilidad, sensibilidades ni pares |
| `relation` | `association=<id>` | El resultado completo de una relación y sus pares | Evaluar la familia del otro método |

**Nada se oculta.** Un método con días de resultado manda todas sus relaciones, y el contrato rechaza una lista más corta. Un método sin días de resultado manda su cantidad y `outcomeDays = 0`, sin una lista idéntica por candidato. Un id desconocido responde `item: null`, nunca una relación vacía.

**Reutilización.** Lo calculado queda en memoria del proceso, con clave de cuenta (del token), contador y día de Córdoba, 3 entradas y 5 minutos. Cada pedido vuelve a leer el contador bajo RLS: si coincide, responde sin leer el historial; si se movió, lee todo de nuevo. El token se valida siempre. **Es una optimización, no una garantía:** en otra instancia de Vercel se paga la lectura completa, y la tasa de aciertos real no se conoce. Ver [revisión de las fuentes](367-insights-source-revision.md).

**Identidad y consistencia.** `sourceRevision` sale del contador, y la UI no une páginas con revisiones distintas. Un cambio confirmado en las fuentes cubiertas mueve el contador, también durante una lectura: se reintenta una vez, y después responde 503.

## Costo y escala

**Metodología.** Perfiles sintéticos, cada uno en su propio proceso (`scale.test.ts`), cinco corridas, con mediana y máximo. *Retenida* es el heap vivo que agrega la instantánea tras forzar recolección, con sus relaciones evaluadas. *Pico* es el máximo residente del proceso menos el residente con la fuente ya construida: incluye basura sin recolectar, no el costo de leer de la base y abarca las cinco corridas. Consultas: `P` son las páginas de los siete flujos.

**Consultas**

| Pedido | Fórmula | 1 año | 5 años | 10 años |
| --- | --- | --- | --- | --- |
| Lectura completa | `P + 2` | 18 | 84 | 268 |
| Con un reintento (fuente que cambia, 503 o medianoche) | `2(P + 2)` | 36 | 168 | 536 |
| Ambos reintentos | `4(P + 2)` | 72 | 336 | 1072 |
| **Otra vista, si sigue en memoria** | **1** | 1 | 1 | 1 |

**Cálculo por pedido** (datos de hoy, carril parcial; mediana / máximo)

| Perfil | Antes, todo junto | Resumen o más días | Relaciones | Una relación |
| --- | --- | --- | --- | --- |
| 1 año | 134 ms | 52 / 76 ms | + 23 / 28 ms | + hasta 28 ms |
| 5 años | 1,10 s | 271 / 377 ms | + 257 / 261 ms | + hasta 261 ms |
| 10 años | 6,4 s | **877 ms / 1,03 s** | + 904 / 920 ms | + hasta 920 ms |

Con configuración conocida los tiempos son del mismo orden. Si sigue en memoria, más días o una relación ya evaluada tardan menos de 2 ms.

**Respuesta** (KiB; datos de hoy)

| Perfil | `summary` | `days` | `relations` | `relation` | Antes |
| --- | --- | --- | --- | --- | --- |
| 1 año | 78 | 63 | 11 | 22 | 122 |
| 5 años | 93 | 70 | 21 | 120 | 177 |
| 10 años | 123 | 89 | 29 | **258** | 241 |

**Memoria** (datos de hoy): pico de 41, 79 y **210 MiB** a 1, 5 y 10 años. Medición vigente, con el piso de heap necesario: ver «Memoria del motor, 2026-11» más abajo.

**PostgREST local real a 5 años** (unas 1320 sesiones; pila descartable):

| Base | Lectura completa (60 consultas) | Otra vista (1 consulta) | Relaciones, la primera vez |
| --- | --- | --- | --- |
| Con estadísticas | 426–634 ms | 3 ms | 203–226 ms |
| Recién sembrada, sin estadísticas | 618–734 ms | 3 ms | 205–206 ms |

**Sigue fuera de presupuesto:**
- **Lectura en frío a 10 años:** 268 consultas, y el cálculo llega a 1,03 s. Es lo que cuesta cada pedido que no encuentra la lectura en memoria.
- **Una relación a 10 años:** 258 KiB contra 128. Son sus 3136 pares, que son la evidencia. No se recortan.
- **Pico de memoria a 10 años:** 210 MiB contra 128. Es un límite superior porque abarca cinco corridas, pero no se probó en la función real de Vercel.

**Por qué no cambian los resultados:**
- El resumen indexa la historia de cada ejercicio por contexto, en lugar de recorrerla por cada exposición. 120 historiales aleatorios con contextos mezclados, empates, sesiones rotas y bloques repetidos dan **exactamente** lo mismo que el recorrido, exclusiones incluidas.
- Una huella de los resultados de un año, tomada antes de tocar el código, es idéntica después, salvo el nombre del estado parcial.
- Cada vista se compara contra el modelo completo.
- La muestra de 20 historiales de la calibración parcial sale idéntica en sus 8 escenarios originales.

**Para qué calibraciones vale:** ninguna campaña se invalidó, porque ni la compuerta ni los resultados del comparador cambiaron. No se repitieron.

## Memoria del motor, 2026-11

Medido sobre main `f53fae0` y sobre `codex/367-insights-memory`, con el mismo equipo, los mismos datos sintéticos y el mismo procedimiento. Las cifras anteriores de esta página (209–210 MiB, 268 consultas) eran de otro código.

**Qué se mide**
- **Retenida:** heap vivo que agrega la instantánea, con sus relaciones evaluadas, tras forzar la recolección. Es lo que ocupa cada entrada reutilizable en memoria.
- **Pico residente:** como arriba, máximo residente menos el residente con la fuente construida, a lo largo de cinco corridas.
- **Piso de heap:** el `--max-old-space-size` más chico con el que una instantánea de 10 años y las relaciones de los dos métodos terminan, en su propio proceso. Incluye la fuente (67,5 MiB) y el proceso de prueba. Es la memoria viva que hace falta; el residente no la muestra, porque V8 no devuelve memoria entre fases.

**Qué se encontró**
- A 10 años, la salida completa de cada comparador quedaba viva hasta el final de la construcción, junto con la otra y con las sesiones adaptadas:
  - estricto: 26 MiB;
  - parcial: 68 MiB, con evidencia, récords, volúmenes y exposiciones por ejercicio;
  - sesiones adaptadas: 12,6 MiB.
- El modelo de lectura solo usa unos pocos campos por ejercicio.
- Cada carril reutilizable retenía la tabla de exposición entera, cuando sus relaciones solo necesitan filas, candidatos y sesiones por día.

**Qué cambió (`read-model.ts`)**
- Cada comparador se calcula dentro de un ayudante que devuelve solo los hechos publicados. Su salida completa queda como basura antes de que corra el siguiente.
- Las sesiones adaptadas solo viven mientras corren los comparadores.
- Cada carril guarda `rows`, `candidates` y `sessionIdsByDate`.
- Sin cambios en comparadores, candidatos, ventanas, denominadores, métodos, contratos, caché ni RLS.

| Perfil | Retenida, antes → después | Pico residente, antes → después |
| --- | --- | --- |
| 1 año, método 2 | 2,0 → 1,9 MiB | 40,4 → 41,6 MiB |
| 5 años, método 2 | 7,4 → 6,5 MiB | 83,5 → 80,6 MiB |
| 10 años, método 2 | **15,5 → 13,1 MiB** | 213,4 → 213,9 MiB |
| 10 años, método 1 | 14,5 → 13,4 MiB | 212,4 → 213,6 MiB |
| 10 años, método 2, configuración capturada | 13,7 → 11,2 MiB | 177,4 → 178,9 MiB |

**Piso de heap, 10 años, método 2, con las relaciones de los dos métodos**
- **Antes:** 220 MiB, 4 de 4. Con 215 MiB terminó 1 de 4; con 210, 0 de 4.
- **Después:** 175 MiB, 5 de 5. Con 172 MiB terminó 1 de 1; con 170, 0 de 5.
- Unos **45 MiB menos de memoria viva necesaria**.

**Tiempo (10 años, método 2, mediana / máximo):**
- instantánea: 1095 / 1139 → 1126 / 1226 ms;
- relaciones: 1061 / 1149 → 1085 / 1171 ms.

Está dentro de la variación entre corridas de este equipo. No hay una mejora ni un costo medible.

**Consultas y respuesta:** sin cambios.
- **Consultas:** 18, 84 y 268 a 1, 5 y 10 años (`P + 2`).
- **Respuestas a 10 años** (`summary`, `days`, `relations`, `relation`): 123,9, 89,8, 29,4 y 258,1 KiB.

**Equivalencia**
- **Huella:** `equivalence-fingerprint.test.ts` hashea todas las vistas, todas las páginas de días y la evidencia completa de cada relación de los dos métodos. Cubre cinco historiales sintéticos de 1 y 5 años, con y sin configuración, más el modelo completo y sus detalles.
- **Resultado:** 53 de 53 hashes iguales antes y después. Dos corridas del código anterior dieron hashes idénticos.
- **Prueba dirigida:** `memory.test.ts` reconstruye los hechos desde la salida completa de cada comparador, como lo hacía el código anterior, y los compara con la instantánea.
- **Pruebas del motor, contrato y comparador:** 296 pasan. Insights en Mobile: 49.

**Sigue fuera de presupuesto**
- **Pico residente a 10 años:** unos 213 MiB, sin cambio. Lo fija el trabajo interno de cada comparador. Medido solo, el parcial lleva el residente a 109 MiB sobre la base, contando las sesiones adaptadas.
- **Bajarlo exige otro cambio, más grande:** que el comparador ofrezca un modo que no materialice evidencia, volúmenes ni copias de series para quien solo usa estado, motivo, referencia y récord. Ese cambio toca `performance-insights` y necesita su propia equivalencia. No se hizo aquí.
- **Sin cambios:** la lectura en frío (268 consultas) y el detalle de una relación (258 KiB).

## Qué sigue valiendo

| Evidencia | Estado |
| --- | --- |
| Pruebas del comparador estricto (67) | Pasan sin cambios en sus expectativas |
| Calibración estricta y binaria | Vigente: la política de asociaciones no cambió |
| Calibración parcial | Vigente: comparador y compuerta dan lo mismo |
| PostgREST local de PR 4 | Reemplazada por la medición de arriba |

## Pendiente

- Captura futura de configuración: **la regla de producto sigue sin definir**. No se escribe `none` ni se impone que toda variante sea otro ejercicio.
- Presupuesto de riesgo. «Consistente» sigue deshabilitado.
- Revisión transaccional y reutilización: PR aparte, con [su límite](367-insights-source-revision.md).
- Latencia real: requiere OBSERVE.
