# Insights #367 — Método parcial `insights-performance-partial/1`

Sobre [PR 4](367-insights-pr4-motor.md) (#385). **Es otro método, no un ajuste de `insights-performance/1`**, que conserva su semántica. Asociaciones: `insights-engine-partial/1`. Sin migraciones ni escritura de datos: ejecuta solo lectura.

Existe porque la configuración histórica (agarre, banco, posición) nunca se capturó. Con el método estricto, todo el historial queda en `missing_context`.

## Reglas

| Regla | Detalle |
| --- | --- |
| Compara | Mismo UUID, modo, unidad e implemento históricos, con configuración desconocida en ambos lados |
| Nunca compara | Conocida contra desconocida; modo, unidad o implemento faltantes o distintos |
| Nunca hace | Completar datos desde el catálogo vigente, escribir `none`, reconstruir historia |
| Dice | «Registro superior, igual o inferior con contexto parcial» |
| No dice | Mejora, descenso, capacidad, fuerza ni causa. Esas palabras no existen en el carril: `higher_record`, `same_record`, `lower_record` |
| Máximos | `highestInPartialContext`, separados de los récords estrictos |
| «Consistente» | Imposible: `promotion.status = not_enabled`, motivo `partial_context` |

## Partición: una observación nunca se cuenta dos veces

Cada ejercicio de cada sesión cae de un solo lado:

- **Alguna configuración conocida** en cualquiera de sus bloques → solo método estricto.
- **Toda desconocida** → carril parcial.

`partial.partition` da `total`, `configurationKnown` y `configurationUnknown`, y el contrato rechaza una suma que no cierre.

**Denominadores.** `facts.totals.total` sigue contando todas las exposiciones: su semántica no cambió, y las desconocidas figuran allí como `missing_context`. `partial.totals.total` cuenta solo las desconocidas. `comparable` es disjunto entre métodos; **`total` no se puede sumar**. La UI no suma ninguno.

## Contrato

Carril `partial`, aditivo en `performance-insights/1`, que sigue sin consumidores. Sin sus rótulos, el contrato rechaza toda la lectura.

| Campo | Contenido |
| --- | --- |
| `methodVersion`, `engineMethodVersion`, `contextCompleteness` | Identifican el método; `configuration_unknown` |
| `partition`, `outcomeDays` | Denominadores propios |
| `totals`, `exercises`, `days` | Mismas fechas y paginación que `facts.days`, con conteos propios. El contexto del día sigue en `facts` y no pertenece a ningún método |
| `associations` | Familia propia con ids `partial:...`, resultado `daily_lower_record_proportion` y corrección solo sobre sus candidatos |
| `exclusions` | Por ejercicio y por día |

`association=partial:<id>` trae los pares de esa relación; el id sin prefijo trae los del estricto.

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

**El método no puede distinguir esto de un efecto real.** Si en los días de poca energía elegís una variante más fácil sin registrarla, aparece una relación que no viene de la energía. Por eso nunca se presenta como causa, se rotula siempre y no puede promoverse. La frecuencia real no se conoce: este escenario no estima cuánto ocurre, muestra qué pasa si ocurre.

### Efecto real plantado

| Escenario | Estricta | Exploratorio |
| --- | --- | --- |
| Efecto de 1 repetición, sin cambios | 100 % | 100 % |
| Efecto de 1 repetición, cambios 15 % | 100 % | 100 % |
| Efecto de 0,2 repeticiones, sin cambios | 1,8 % | 10,1 % |
| Efecto de 0,2 repeticiones, cambios 15 % | 1,8 % | 8,1 % |

A 0,2 repeticiones casi no hay potencia, con o sin cambios: un efecto débil puede pasar desapercibido.

**El objetivo del 1 % sigue sin aprobar**, y estas cifras tampoco lo aprueban para este método.

## Costo y escala

**Consultas:** sin cambios respecto de PR 4, porque el método es cálculo puro sobre la misma lectura: `P + 14` por intento (96 a 5 años, 280 a 10 años; ver [costo real](367-insights-pr4-motor.md#costo-real-de-lectura)). No se repitió la medición contra PostgREST porque el loader no cambió; esa evidencia sigue valiendo. La RPC de revisiones sigue como propuesta: agrupar consultas por sí solo no demuestra que arregle el plan lento de `workout_sets`.

**Cálculo con ambos métodos** (5 corridas, perfil sintético, máximo):

| Perfil | Datos | Comparables | Tiempo | Respuesta por defecto |
| --- | --- | --- | --- | --- |
| 1 año | Hoy (parcial) | 1278 | 134 ms | 122 KiB |
| 5 años | Hoy (parcial) | 7826 | **1,10 s** | **177 KiB** |
| 10 años | Hoy (parcial) | 25 036 | **6,4 s** | **241 KiB** |
| 1 año | Con captura (estricto) | 1278 | 151 ms | 97 KiB |
| 5 años | Con captura (estricto) | 7826 | **1,16 s** | **150 KiB** |
| 10 años | Con captura (estricto) | 25 036 | **6,3 s** | **203 KiB** |

**Quedan fuera de los objetivos** de 1 s y 128 KiB desde 5 años. Lo que más pesa en el tamaño es publicar los ítems de los dos métodos: el carril sin días de resultado igual manda todos sus candidatos. **Propuesta sin aplicar:** omitir `items` en un carril con `outcomeDays = 0`; ahorraría unos 45 KiB a 5 años. El tiempo está dominado por las permutaciones. Los perfiles son sintéticos y densos; falta OBSERVE.

La memoria medida (452 MiB a 10 años) es el `heapUsed` tras cinco corridas sin forzar recolección, no un pico: no sirve para comparar.

## Qué sigue valiendo

| Evidencia | Estado |
| --- | --- |
| Pruebas del comparador estricto (67) | Pasan sin cambios en sus expectativas |
| Calibración estricta y binaria | Vigente: la política de asociaciones no cambió |
| PostgREST local de PR 4 | Vigente para consultas; el tiempo de cálculo es el de esta tabla |

## Pendiente

- Captura futura de configuración: **la regla de producto sigue sin definir**. No se escribe `none` ni se impone que toda variante sea otro ejercicio.
- Presupuesto de riesgo. «Consistente» sigue deshabilitado.
- Decidir la omisión de `items` y la latencia con datos de OBSERVE.
