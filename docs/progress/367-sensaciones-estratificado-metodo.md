# #367 — Energía y fatiga al terminar: método experimental estratificado

**Preregistro.** Este documento se escribió y se commiteó antes de implementar el método y de correr cualquier simulación. Las secciones «Desarrollo» y «Validación reservada» se agregan después y no cambian nada de lo de arriba.

Antecedente: [367-sensaciones-resultado-metodo.md](367-sensaciones-resultado-metodo.md) (#412). Aquel método no alcanzó el objetivo propuesto: con cambios de rutina la compuerta estricta dio 7,2 % y con tendencias 6,2 %. **Todo lo de este documento es experimental y queda fuera de las vistas públicas, aunque dé bien.** El 1 % es un objetivo propuesto, no una tolerancia aprobada, y «consistente» sigue deshabilitado.

## Por qué falló el método anterior

- **Su nulo rompía la estructura que comparten exposición y resultado.** La política de asociaciones permuta el resultado por bloques de 14 filas en toda la historia, así que mezcla filas de eras distintas.
- **Las tendencias y los cambios de rutina sobreviven al filtro.** Si una era de rutina o una tendencia corre a la vez la exposición y la sensación, el filtro de tendencia local (mediana de ±28 días) no quita todo ese corrimiento compartido.
- **Consecuencia:** el valor observado parece raro frente a un nulo que perdió esa coincidencia.

## Alternativa: permutación y correlación dentro de estratos

**Hipótesis nula explícita:** dentro de una misma rutina registrada y un mismo bloque de calendario, el orden de los días es intercambiable. Lo que se prueba es la asociación **dentro** de esos estratos, nunca entre eras ni a lo largo de una tendencia.

### Unidad, elegibilidad y exclusiones

Las de #412, sin cambios (`describeFeelingOutcome` y `prepareFeelingAssociations`):
- **unidad:** día cerrado con exactamente una sesión terminada;
- **respuesta al terminar:** legible, del instrumento `energy-fatigue/1`, capturada entre el inicio y 2 h después del final;
- **respuesta previa del mismo tipo:** comparable, es decir legible y capturada antes del inicio o de la primera serie;
- **exclusiones**, contadas: `day_still_open`, `multiple_sessions_day`, `prior_*`, respuestas tardías, sin hora, ilegibles o de otro instrumento;
- **energía y fatiga:** ordinales y separadas, sin promedios, puntajes, inversión ni diferencia antes → después.

### Control de la sensación previa

Igual que en #412: el resultado de un día es su respuesta al terminar ordenada entre los días con la misma respuesta previa (`stratifiedRows`). La previa es marco, nunca exposición.

### Estratos, rutina y dependencia temporal

- **Estrato:** la rutina registrada de la sesión (`routineId`; sin rutina es «free») por el bloque de calendario de 42 días.
  - Los bloques se cuentan desde el primer día elegible de la historia.
  - Ni la rutina ni el bloque se infieren de los resultados.
- **Estratos con menos de 4 filas** pareadas para un candidato quedan afuera de ese candidato. Se cuenta la pérdida de cobertura.
- **Estadístico:** correlación de Spearman estratificada.
  - Dentro de cada estrato, rangos medios de la exposición y del resultado, centrados en ese estrato.
  - El estadístico es Σ(cx·cy) / √(Σcx² · Σcy²) sobre todos los estratos.
  - No hay filtro de tendencia: el bloque es el control temporal.
- **Nulo:** 499 permutaciones, o 199 en las simulaciones.
  - Cada una permuta el resultado solo dentro de cada estrato.
  - La misma permutación vale para todos los candidatos de un resultado, y la semilla es fija.
- **Lo que no corrige:**
  - una relación inversa del mismo día, una exposición registrada después de la sesión y movida por cómo terminó. Es una limitación de la definición del candidato (`same_day_unordered`), no del método, y se mide aparte;
  - un cambio que ocurre a mitad de un bloque.

### Familia evaluada

- Por resultado, todos los candidatos de `prepareFeelingAssociations` (la tabla de exposiciones del rendimiento sin la familia «feeling»), con la corrección por el máximo de la familia en cada permutación.
- Energía y fatiga son dos familias. Su multiplicidad se cubre partiendo el umbral estricto entre las dos: 0,01 / 2 = 0,005 por familia.

### Compuertas, fijadas aquí

| | Mínimo de pares en estratos conservados | Valor p | \|ρ estratificado\| | Además |
| --- | --- | --- | --- | --- |
| Exploratoria | 20 | p sin ajustar ≤ 0,05 | ≥ 0,25 | al menos 5 observaciones fuera del valor más repetido |
| Estricta | 40 | p ajustado por familia ≤ 0,005 | ≥ 0,30 | ρ de cada mitad de la historia (por fecha) con el mismo signo y \|ρ\| ≥ 0,15 |

## Simulación desde filas fuente

- **Recorrido real:** se simulan sesiones con su rutina, sensaciones con su instrumento y su hora de captura, y métricas diarias. Después corre el mismo código: `buildExposureContext` → `prepareFeelingAssociations` → el método nuevo. El método de #412 se evalúa sobre las mismas filas, solo como comparación.
- **Datos:**
  - 24 meses, entrenamiento 4 de cada 7 días;
  - respuestas previas y al terminar de energía y fatiga;
  - 6 métricas diarias presentes el 80 % de los días, que dan 12 candidatos más los de nutrición, vacíos;
  - 12 actualizaciones en el último año.
- **Un historial cuenta** si algún candidato de cualquiera de los dos resultados pasa en cualquier actualización.

### Escenarios de desarrollo

Solo para encontrar errores de programación. Semilla `0x5170`, 100 historiales:
- independiente;
- cambios de rutina registrados;
- tendencia;
- efecto moderado plantado.

**Se permite** corregir un error de programación, documentado. **No se permite** cambiar estratos, bloque, mínimos ni umbrales.

### Validación reservada

**Una sola corrida, sin repetir:** semilla `0x5171`, 500 historiales por escenario.

| Escenario | Qué simula | Tipo |
| --- | --- | --- |
| `independent` | sin relación | nulo |
| `autocorrelated` | exposición y sensación con dependencia temporal (AR 0,7) | nulo |
| `trend` | deriva lenta compartida por exposición y sensación | nulo |
| `routine_change` | eras de 6 meses con cambio de rutina registrado, que corren exposición y sensación | nulo |
| `unrecorded_change` | las mismas eras sin cambio de rutina registrado: solo las controla el bloque | nulo |
| `alternating_routines` | dos rutinas alternadas, cada una con su nivel de exposición y de sensación | nulo |
| `selective_absence` | la exposición falta más en los días que se termina con mucha fatiga | nulo |
| `uncertain_timing` | 30 % de respuestas tardías, más en los días con mucha fatiga: quedan excluidas | nulo |
| `reverse_same_day` | la métrica del mismo día se mueve por cómo terminó el día | limitación conocida |
| `planted_moderate` | la métrica 0 del mismo día mueve la sensación dentro de cada era | potencia |
| `planted_strong` | lo mismo, más fuerte | potencia |

### Criterios de validación

1. **Nulos:** en los ocho escenarios nulos, la cota de Wilson al 95 % de «alguna compuerta estricta» (los dos resultados juntos) queda ≤ 1 %.
2. **Limitación conocida:** `reverse_same_day` se informa, no entra en el criterio. Se espera que falle: el orden del mismo día es desconocido.
3. **Se informan siempre:**
   - potencia, estricta y exploratoria, del candidato plantado;
   - «algún exploratorio»;
   - pérdida de cobertura por estratos chicos;
   - las cifras del método de #412 sobre las mismas filas.
4. **Precisión:** con 500 historiales, cero aciertos dan una cota de 0,76 %. Un resultado observado entre 0,2 % y 1 % se informa como impreciso, no como aprobado ni rechazado por el método.

**Si se cumple el criterio 1:** el método queda candidato a una decisión de producto, en otra entrega, con su propio PR. **Si no:** queda documentado como experimental. En ningún caso se publica en esta entrega.

## Desarrollo

Corrida con el código de `488ea69`: semilla `0x5170`, 100 historiales por escenario, 199 permutaciones, unos 80 s por escenario. Se escribió antes de correr la validación reservada.

| Escenario | Filas elegibles al final | Retenidas en estratos | Nuevo: algún exploratorio | Nuevo: estricta | Wilson sup. | #412: estricta |
| --- | --- | --- | --- | --- | --- | --- |
| Independiente | 357 | 100 % | 8 % | 1 % | 5,45 % | 0 % |
| Cambios de rutina registrados | 355 | 99 % | 19 % | 3 % | 8,45 % | 4 % |
| Tendencia | 357 | 100 % | 9 % | 1 % | 5,45 % | 3 % |
| Efecto moderado plantado | 357 | 100 % | 100 % | 98 % (plantado) | — | 98 % (plantado) |

**Revisión de errores:**
- el único acierto estricto del escenario independiente se inspeccionó. Es un candidato con ρ = 0,33 en 144 pares, y la misma dirección en las dos mitades (0,34 y 0,33);
- no se encontró un error de programación: el cálculo es correcto, y con 100 historiales un acierto es compatible con el azar (cota de 5,45 %);
- **no se corrigió nada ni se cambió ningún parámetro.**

**Lo que no se puede decir con esto:** 100 historiales no separan un 1 % de un 0,5 %. Las cifras de desarrollo no deciden nada: la decisión es la de la validación reservada.

## Validación reservada

Corrida única con el código de `488ea69`, sin cambios después del desarrollo: semilla `0x5171`, 500 historiales por escenario, 199 permutaciones, entre 6 y 10 minutos por escenario.

**«Alguna compuerta estricta»** en cualquiera de los dos resultados, con su intervalo de Wilson al 95 %. Las mismas filas, juzgadas con este método y con el de #412:

| Escenario | Tipo | Filas | Retenidas | Nuevo | Wilson 95 % | #412 | Wilson 95 % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Independiente | nulo | 357 | 99,9 % | 2,0 % | 1,09–3,64 % | 0,4 % | 0,11–1,45 % |
| Dependencia temporal | nulo | 357 | 99,9 % | 2,6 % | 1,53–4,40 % | 1,0 % | 0,43–2,32 % |
| Tendencia | nulo | 357 | 99,9 % | 1,6 % | 0,81–3,13 % | 4,6 % | 3,08–6,81 % |
| Cambio de rutina registrado | nulo | 356 | 99,0 % | 1,8 % | 0,95–3,39 % | 4,8 % | 3,25–7,04 % |
| Cambio sin registrar | nulo | 356 | 99,9 % | 3,2 % | 1,98–5,13 % | 5,0 % | 3,41–7,28 % |
| Rutinas alternadas | nulo | 357 | 98,8 % | 2,0 % | 1,09–3,64 % | **100 %** | 99,2–100 % |
| Ausencia selectiva | nulo | 357 | 99,8 % | 2,0 % | 1,09–3,64 % | 0,8 % | 0,31–2,04 % |
| Horarios inciertos | nulo | 267 | 99,6 % | 4,0 % | 2,60–6,10 % | 2,0 % | 1,09–3,64 % |
| Inversa del mismo día | limitación | 357 | 99,9 % | 85,8 % | — | 90,6 % | — |
| Efecto moderado | potencia | 357 | 99,9 % | 96,4 % (plantado) | — | 98,6 % (plantado) | — |
| Efecto fuerte | potencia | 357 | 99,9 % | 100 % (plantado) | — | 100 % (plantado) | — |

**«Algún exploratorio»:** entre 12,4 % y 21,4 % en los nulos; 38,2 % con horarios inciertos.

### Decisión: no valida

- **Criterio 1: no se cumple en ninguno de los ocho nulos.** Las cotas superiores van de 3,13 % a 6,10 %, todas por encima del objetivo propuesto del 1 %.
- **Qué es limitación y qué es falta de precisión** (revisado en #417):
  - **en seis nulos el límite inferior del intervalo supera el 1 %**: independiente (1,09 %), dependencia temporal (1,53 %), cambio sin registrar (1,98 %), rutinas alternadas (1,09 %), ausencia selectiva (1,09 %) y horarios inciertos (2,60 %). En esos seis, la tasa de falsos positivos de este método está, con esta evidencia, por encima del objetivo;
  - **en tendencia y en cambio de rutina registrado el intervalo incluye el 1 %** (0,81–3,13 % y 0,95–3,39 %). La evidencia de hoy es insuficiente para afirmar que alcancen el objetivo, y también para descartarlo. Más historiales podrían acotarlo hacia cualquiera de los dos lados.
- **La decisión no depende de esos dos:** el criterio pide que la cota superior quede ≤ 1 % en los ocho nulos, y los seis anteriores no lo cumplen.
- **El método queda experimental y documentado.** No se publica, no se repitió la corrida y no se ajustó ningún parámetro.

### Qué mejoró y qué no

- **Redujo los falsos positivos en los escenarios de confusión** donde #412 fallaba, sin llegar a validar (revisado en #417):
  - con rutinas alternadas, #412 da 100 % y este método 2,0 %;
  - con cambios de rutina registrados, 4,8 % contra 1,8 %;
  - con tendencias, 4,6 % contra 1,6 %.

  Es una reducción medida en estas simulaciones, no una corrección de la confusión: en esos escenarios la tasa sigue sin quedar demostradamente por debajo del objetivo.
- **Empeoró el nulo sin confusión:**
  - independiente, 2,0 % contra 0,4 %;
  - dependencia temporal, 2,6 % contra 1,0 %.

  La causa más probable, sin comprobar: la compuerta de este método solo pide p ajustado, |ρ| y las dos mitades, sin los controles extra de #412 (tendencia local, sensibilidad, sin extremos). Además se mira 12 veces por historial sin corregir esas miradas.
- **Resolución de las permutaciones:** con 199, el p ajustado más chico posible es 1/200 = 0,005, justo el umbral, así que la compuerta pide que ninguna permutación iguale al observado. Con las 499 por defecto la resolución es más fina. No se midió.
- **Horarios inciertos:** excluir las respuestas tardías baja las filas de 357 a 267 (25 % de cobertura) y sube los falsos positivos a 4,0 %, porque la exclusión depende del resultado. El método no corrige ese sesgo.
- **Inversa del mismo día:** 85,8 %, como se esperaba. Es una limitación de los candidatos «mismo día, sin orden», no del método: ningún estadístico puede saber si la métrica se registró antes o después.
- **Pérdida de cobertura por estratos chicos:** menos del 1,2 % de los pares en todos los escenarios.
- **Potencia:** 96,4 % con el efecto moderado y 100 % con el fuerte. Muy parecida a la de #412, así que estratificar casi no cuesta potencia en estas simulaciones.

### Para un próximo preregistro

No se implementa nada de esto:
- combinar el nulo estratificado con los controles de la compuerta de #412;
- corregir las miradas repetidas, gastando el α a lo largo de las actualizaciones;
- usar 499 permutaciones también en la simulación;
- excluir los candidatos «mismo día, sin orden» de las sensaciones al terminar, por la limitación inversa.

Cada opción es un método nuevo con su preregistro y su validación reservada.
