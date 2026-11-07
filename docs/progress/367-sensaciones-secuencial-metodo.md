# #367 — Energía y fatiga al terminar: diseño secuencial con candidatos anteriores

**Diseño de #419, fijado antes de la campaña.** El prototipo (`feeling-sequential.ts`) permanece experimental y aislado de las vistas. La continuación del 7/11 ejecutó una única [validación reservada](367-sensaciones-secuencial-resultados.md), con [protocolo definitivo previo](367-sensaciones-secuencial-protocolo.md): cuatro nulos no acreditaron el criterio propuesto; la línea se detuvo sin potencia ni recalibración. **No se habilita ninguna asociación.** El 1 % sigue siendo un objetivo propuesto, no una tolerancia aprobada, y «consistente» sigue deshabilitado.

Antecedentes:
- [367-sensaciones-resultado-metodo.md](367-sensaciones-resultado-metodo.md) (#412);
- [367-sensaciones-estratificado-metodo.md](367-sensaciones-estratificado-metodo.md) (#417).

## Los dos problemas

1. **Revisiones repetidas sin control.** Los métodos anteriores corrigen por candidatos dentro de una lectura, pero la historia se vuelve a mirar en cada actualización. Las simulaciones contaron 12 miradas por historial, y cualquier acierto en cualquiera de ellas cuenta. Nada en la compuerta cubría esas miradas. Es la explicación más probable de que el nulo independiente de #417 diera 2,0 %.
2. **Candidatos del mismo día sin orden.** Una métrica o una comida del mismo día pudo registrarse después de entrenar y estar movida por cómo terminó. En #417, ese escenario dio 85,8 % de falsos positivos. Ningún estadístico lo corrige: el candidato tiene que salir de la familia.

## Método propuesto: `insights-feeling-sequential/1`

### Qué se conserva de #412 y #417

- **Unidad, elegibilidad y exclusiones de los días:** las de `prepareFeelingAssociations`.
  - Día cerrado con una sola sesión.
  - Respuesta al terminar legible, del instrumento vigente y capturada al terminar.
  - Respuesta previa comparable.
- **Energía y fatiga:** ordinales y separadas, sin promedios, puntajes, inversión ni diferencia antes → después.
- **Contexto previo:** el resultado se ordena dentro de su nivel previo (`stratifiedRows`).
- **Rutina y dependencia temporal:** la correlación y las permutaciones de #417, dentro de estratos de rutina registrada × bloque de 42 días, y los estratos de menos de 4 filas afuera.

### Candidatos temporalmente elegibles

**Entran** solo los candidatos cuya exposición está demostradamente antes del inicio de la sesión:

| Base temporal | Candidatos | Por qué entra |
| --- | --- | --- |
| `previous_logical_day` | métricas y nutrición del día anterior | el día lógico anterior termina antes del día de la sesión |
| `explicit_meal_time_before_start` | carbohidratos en las 3 h previas y antes del inicio, con hora explícita | la hora es explícita y anterior al inicio |

**Quedan afuera:**

| Base temporal | Candidatos | Por qué sale |
| --- | --- | --- |
| `same_day_unordered` | métricas y nutrición del mismo día, peso del día | no se sabe si son de antes o de después de entrenar |
| `undeclared_sleep_date` | sueño sin noche declarada | la fecha puede ser cualquiera de dos noches |
| `declared_night_ending_on_day` | sueño con noche declarada (#419) | la noche termina el día D, pero no se sabe a qué hora. Una sesión de madrugada de D puede empezar antes de que termine, así que no está demostrado que sea anterior. Queda afuera mientras no haya una hora de despertar registrada. El contexto de sueño publicado no cambia |
| familia `feeling` | sensaciones previas | son el marco del resultado, no exposiciones |

Los candidatos de la fase 2 (proteína y calorías en 3 h, última comida) no forman parte de las familias públicas y tampoco entran aquí.

**Límite que no se resuelve:** «anterior» se refiere a lo que el dato describe, no a cuándo se cargó. Una métrica de ayer cargada hoy después de entrenar, y elegida por cómo terminó, no se distingue. Es una supuesta buena fe del registro, y se declara.

### Alcance del control de falsos positivos

- **Candidatos:** el máximo de la familia de cada resultado en cada permutación (sin cambios).
- **Dos resultados:** α total de 0,01, partido entre energía y fatiga (0,005 cada uno, desigualdad de Bonferroni).
- **Actualizaciones:**
  - **Calendario fijo de miradas.** Una mirada cada 3 meses calendario desde el primer día elegible; la primera, cuando haya al menos 20 pares en algún candidato.
  - Entre miradas, el resultado no cambia, aunque la app se abra mil veces o lleguen datos nuevos.
  - La mirada k usa los datos hasta su fecha.
  - **Gasto de α por mirada:** α_k = 0,005 / (k (k + 1)) por resultado. La suma sobre todas las miradas posibles es 0,005, así que el control vale también para una historia que sigue creciendo, sin horizonte fijo.
  - Ejemplos: α_1 = 0,0025; α_4 = 0,00025; α_8 = 0,0000694.
- **Total por historial:** con estas tres capas, la probabilidad de algún falso positivo en cualquier candidato, cualquiera de los dos resultados y cualquier mirada queda acotada por 0,01. Es una cota de unión: es conservadora si las miradas están correlacionadas, y lo están.
- **Esa cota no está garantizada por el reparto en sí** (#419). La desigualdad de Bonferroni suma errores de pruebas que tienen que ser válidas una por una: cada prueba de una mirada tiene que dar, bajo su nulo, un p que no subestime la probabilidad real. Depende de supuestos:
  - **intercambiabilidad dentro de los estratos:** si un cambio a mitad de bloque o una rutina sin registrar la rompen, una prueba puede ser liberal, y el reparto no lo compensa;
  - **exposición anterior de verdad:** un candidato mal clasificado como anterior trae una relación que ninguna prueba distingue;
  - **ausencia ignorable:** con ausencia selectiva, la prueba responde otra pregunta, la de los días presentes;
  - **p de Monte Carlo correcto:** el de una corrida completa y, para un candidato detenido, solo su cota (ver abajo).

  Por eso el error total se mide en la validación reservada y no se da por cierto a partir del reparto.

### Compuerta única

No hay estado exploratorio: el exploratorio sin corregir dio entre 7 % y 38 % en los nulos de los métodos anteriores. Un candidato pasa en la mirada k si cumple todo esto:
- p ajustado por la familia ≤ α_k (con la resolución de la sección siguiente);
- al menos 40 pares en estratos conservados;
- |ρ estratificado| ≥ 0,30;
- las dos mitades de la historia (por fecha) con el mismo signo y |ρ| ≥ 0,15;
- al menos 5 observaciones fuera del valor más repetido.

Estados: `insufficient_data`, `no_clear_signal`, `passes_sequential_gate`.

### Resolución estadística y costo

- **Resolución:** con B permutaciones, el p más chico posible es 1/(B + 1). Para que α_k sea alcanzable hace falta B ≥ 1/α_k − 1, y para no perder potencia en el borde, unas 10 veces más.
  - Mirada 1: unas 4 000.
  - Mirada 4: unas 40 000.
  - Mirada 8: unas 144 000.
- **Costo con un recorte secuencial** (Besag y Clifford): cada permutación compara el máximo de la familia contra cada candidato.
  - Un candidato deja de contarse cuando acumula h = 10 excedencias y ya no puede pasar: aunque no hubiera ninguna más, su p sobre toda la corrida, (h + 1)/(B_k + 1), quedaría por encima de α_k.
  - **Lo que devuelve un candidato detenido** (corregido en #419):
    - no un p sino un descarte (`stopped_early`), con dónde se detuvo (`stopped.at`), sus excedencias y una cota explícita: su p sobre las B_k permutaciones permitidas sería al menos (h + 1)/(B_k + 1);
    - antes se le calculaba un cociente con todas las permutaciones de la corrida, también las que corrieron por otro candidato después de que dejó de contarse. Ese cociente no es un p de nada;
    - solo un candidato contado hasta el final tiene p (`familyAdjustedP`), sobre todas las permutaciones de la corrida.
  - La corrida termina cuando todos los candidatos se decidieron o se llega a B_k.
  - Bajo el nulo, casi todos se deciden en las primeras decenas o cientos de permutaciones, y solo un candidato fuerte llega a B_k.
- **Costo por permutación:** O(filas × candidatos), unas 350 filas por 10 a 20 candidatos.

  La medición de viabilidad de abajo da el tiempo real.

### Supuestos y límites

- **Intercambiabilidad:** dentro de rutina × bloque de 42 días, el orden de los días es intercambiable bajo el nulo. Un cambio a mitad de bloque o una rutina sin registrar lo rompe en parte.
- **Ausencia selectiva:**
  - si la exposición o la respuesta faltan más en ciertos resultados, el método estima la asociación entre los días presentes, que puede no ser la de todos los días;
  - las permutaciones no corrigen ese sesgo; se informa la cobertura y se simula aparte;
  - las respuestas tardías excluidas son un caso de esto: en #417 bajaron las filas un 25 % y subieron los falsos positivos.
- **Gasto conservador:** la cota de unión entre miradas y entre resultados paga potencia. Con miradas muy correlacionadas, el error real puede quedar bastante por debajo de 0,01.
- **Potencia esperable:** menor que en #412 y #417, por los umbrales que bajan con las miradas y por la salida de los candidatos del mismo día, que eran los más fuertes en las simulaciones. Hay que medirla en la validación.
- **Sin causalidad:** pasar la compuerta significaría que, en tus registros, X coincidió con Y antes del entrenamiento. Nunca que X lo causó.

## Futura validación reservada

**No se corrió en #419.** La continuación queda fijada antes de ejecutarla en
[el protocolo definitivo](367-sensaciones-secuencial-protocolo.md) y su JSON: ese protocolo resuelve los horizontes anidados,
los cuatro escenarios de potencia, la disponibilidad temporal y la parada si los nulos no cumplen. La propuesta original de abajo
se conserva como antecedente; no sustituye al protocolo ejecutable.

- **Recorrido:**
  - filas fuente simuladas, como en #417, ampliadas con métricas del día anterior y comidas con hora explícita, para que haya candidatos elegibles de las dos bases;
  - el calendario de miradas trimestrales real, 24 meses (8 miradas) y 36 meses (12 miradas).
- **Escenarios nulos:**
  - independiente;
  - dependencia temporal;
  - tendencia;
  - cambio de rutina registrado;
  - cambio sin registrar;
  - rutinas alternadas;
  - ausencia selectiva;
  - horarios inciertos;
  - **inversa del mismo día**, que ahora es un nulo: su candidato ya no entra.
- **Potencia:** efecto moderado y fuerte de una métrica del día anterior y de los carbohidratos con hora explícita.
- **Tamaño:** 1 000 historiales por escenario, con semilla reservada nueva.
  - Con 0 a 3 aciertos en 1 000, la cota de Wilson bilateral al 95 % queda ≤ 1,0 % (4/1 000 da 1,02 % y no cumple; 3/1 000 da 0,88 %).
  - 500 no alcanzan para separar 0,5 % de 1 %.
- **Criterio:** la cota superior de Wilson al 95 % de «algún paso en cualquier candidato, cualquiera de los dos resultados y cualquier mirada» queda ≤ 1 % en todos los nulos. Si un intervalo incluye el 1 %, se informa como evidencia insuficiente, no como aprobado.
- **Se informa además:**
  - potencia por mirada;
  - permutaciones usadas;
  - pérdida de cobertura por candidatos fuera y por estratos chicos;
  - tiempo.
- **Costo estimado** con la medición de viabilidad: ver abajo.

## Medición de viabilidad

**Vigencia después de #419:** las cifras siguen valiendo.
- La simulación no tiene sueño, así que sacar la noche declarada no cambia la familia de 12.
- El cambio en los candidatos detenidos cambia lo que se informa de ellos, no las permutaciones que corren ni quién pasa: un candidato solo se detiene cuando ya no podía pasar.

**Qué es:** una corrida chica para saber si el diseño se puede calcular y si encuentra lo que tiene que encontrar.

**Qué no es:** una validación. Con 20 historiales, 0 aciertos dan una cota de Wilson cercana al 16 %, así que **no dice nada sobre el objetivo del 1 %**.

**Cómo se corrió:** prototipo de `1eebb32`, 20 historiales por escenario, 24 meses, todas las miradas trimestrales de cada historial y los dos resultados. Las filas fuente son las de `feeling-stratified-calibration.ts`. El efecto del día anterior se sembró sobre ellas, desplazando la energía al terminar según la métrica 0 del día anterior.

| Escenario | Miradas por resultado | Permutaciones por mirada | Candidatos que llegan a permutarse por mirada | Algún paso | Paso del sembrado | Análisis más lento (todas las miradas) |
| --- | --- | --- | --- | --- | --- | --- |
| Independiente | 7 | 3 | 0,02 | 0/20 | — | 63 ms |
| Cambio de rutina registrado | 7 | 2 | 0,01 | 0/20 | — | 42 ms |
| Inversa del mismo día | 7 | 4 | 0,01 | 0/20 | — | 43 ms |
| Efecto del día anterior, moderado | 7 | 23 558 | 0,46 | 20/20 | 20/20 | 4,4 s |
| Efecto del día anterior, fuerte | 7 | 23 746 | 0,47 | 20/20 | 20/20 | 4,5 s |

**Candidatos:**
- 23 por resultado: 12 elegibles y 11 afuera (6 métricas y 4 nutrientes del mismo día, y el peso del día);
- en esta simulación solo las 6 métricas del día anterior tienen datos: no hay comidas. La futura validación tiene que agregarlas para probar esa base. El sueño declarado ya no entra (#419).

**Lo que muestra:**
- **El recorte por compuertas descriptivas casi elimina el costo bajo el nulo.** Casi ninguna mirada tiene un candidato que pueda pasar, así que casi nunca se permuta.
- **Cuando hay señal, se paga la resolución:** las miradas tardías necesitan hasta 112 000 permutaciones (mirada 7) para un candidato que no se decide antes. Un análisis completo de un resultado tarda unos 4,5 s en este caso.
- **La inversa del mismo día deja de ser un problema por construcción:** su candidato no entra en la familia.
- **Los efectos sembrados se encuentran.** Son efectos grandes en una escala de 5 puntos; la potencia frente a efectos chicos no se midió.

**Costo estimado de la futura validación** (1 000 historiales por escenario):
- nueve nulos a unos 0,1 s por historial, unos 15 minutos;
- dos de potencia a unos 9 s por historial (los dos resultados), unas 5 horas en serie o menos de una hora en paralelo.

**Defecto de la herramienta, no del método:** la medición corre en un solo bloque síncrono, y vitest avisa «Timeout calling onTaskUpdate» aunque la prueba pase. Una campaña completa tendría que ceder el hilo entre historiales, como las anteriores.

**Lo que falta antes de una validación:**
- la base de comidas con hora explícita en la simulación;
- un generador que ceda el hilo;
- una semilla reservada nueva.

Eso quedaba pendiente al cerrar #419. La continuación completó el simulador y una única campaña con [protocolo previo](367-sensaciones-secuencial-protocolo.md); [no acreditó el criterio y se detuvo](367-sensaciones-secuencial-resultados.md), sin potencia ni recalibración.
