# #367 — Energía y fatiga al terminar: diseño secuencial con candidatos anteriores

**Diseño, antes de cualquier campaña.** Este documento fija el método y los criterios de una futura validación reservada. El prototipo que lo acompaña (`feeling-sequential.ts`) sirve solo para probar que el diseño se puede calcular: **no hay corrida de validación, no se habilita ninguna asociación y nada llega a las vistas.** El 1 % sigue siendo un objetivo propuesto, no una tolerancia aprobada, y «consistente» sigue deshabilitado.

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
| `declared_night_ending_on_day` | sueño con noche declarada | la noche terminó la mañana del día de la sesión |

**Quedan afuera:**

| Base temporal | Candidatos | Por qué sale |
| --- | --- | --- |
| `same_day_unordered` | métricas y nutrición del mismo día, peso del día | no se sabe si son de antes o de después de entrenar |
| `undeclared_sleep_date` | sueño sin noche declarada | la fecha puede ser cualquiera de dos noches |
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
  - Un candidato deja de permutarse cuando acumula h = 10 excedencias: su p ya no puede bajar de 10/(b + 1), y si α_k es menor queda decidido sin pasar.
  - La corrida termina cuando todos los candidatos se decidieron o se llega a B_k.
  - Bajo el nulo, casi todos se deciden en las primeras decenas o cientos de permutaciones, y solo un candidato fuerte llega a B_k. El p es válido con el recorte.
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

**No se corre en esta entrega.**

- **Recorrido:**
  - filas fuente simuladas, como en #417, ampliadas con métricas del día anterior, comidas con hora explícita y sueño declarado, para que haya candidatos elegibles;
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
  - Con 0 a 4 aciertos en 1 000, la cota de Wilson queda ≤ 1,0 % (4/1 000 da 1,02 %; 3/1 000 da 0,88 %).
  - 500 no alcanzan para separar 0,5 % de 1 %.
- **Criterio:** la cota superior de Wilson al 95 % de «algún paso en cualquier candidato, cualquiera de los dos resultados y cualquier mirada» queda ≤ 1 % en todos los nulos. Si un intervalo incluye el 1 %, se informa como evidencia insuficiente, no como aprobado.
- **Se informa además:**
  - potencia por mirada;
  - permutaciones usadas;
  - pérdida de cobertura por candidatos fuera y por estratos chicos;
  - tiempo.
- **Costo estimado** con la medición de viabilidad: ver abajo.

## Medición de viabilidad

*(Se completa después de la medición chica del prototipo.)*
