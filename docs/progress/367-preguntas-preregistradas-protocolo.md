# #367 — Preguntas preregistradas: protocolo mínimo (borrador para decisión)

**Estado:** propuesta de diseño, 11/11/2026, sobre `main 2c67a07`. **Nada de esto está implementado, calibrado ni autorizado.**
No hay interfaz, migración, campaña ni lectura de datos personales. Los números de potencia son aproximaciones analíticas;
la calibración descrita en §8 es la que los confirma o los desmiente.

**Decisiones de Dirección que este protocolo asume (11/11/2026):** #441 queda descartado como vía de producción
([resultado negativo](367-441-resultado-negativo.md)); se explora la alternativa D; riesgo provisional del **5 % por
pregunta** (no por revisión); **una sola pregunta activa**.

## 1. Qué es una pregunta

El usuario elige, antes de que existan los datos que la van a responder:

- **Una exposición** de las que el motor ya construye (`exposures.ts`): una métrica diaria, o una exposición previa a la sesión.
- **Un corte fijo**, que la vuelve binaria: «días con X ≥ corte» frente a «días con X < corte». El corte es un número
  guardado al crear la pregunta; nunca se recalcula.
- **Un resultado**, uno solo: la proporción diaria de ejercicios comparables con registro inferior a su referencia
  (`ObservationRow.y`, carril estricto).

Al crearla se congelan: definición, corte, fecha de creación, versión del método, tamaño final `N` y miradas. Queda un
registro inmutable por cuenta. **Solo cuentan los días posteriores al día de creación.** El historial anterior sirve para
elegir la pregunta y se muestra como descripción, nunca como evidencia.

Ese es el principio del diseño: el pasado genera la hipótesis, el futuro la contrasta.

## 2. Contraste

- **Unidad:** día lógico cerrado con resultado comparable y exposición registrada («día pareado»).
- **Estratos:** rutina (`routineKey`) × ventana calendario de 28 días. Un estrato sin días de ambos lados del corte no aporta.
- **Estadístico:** diferencia de medias del resultado entre lados del corte, calculada dentro de cada estrato y combinada
  con peso `n_alto·n_bajo / (n_alto + n_bajo)`.
- **Distribución nula:** desplazamiento circular aleatorio de la secuencia de exposición dentro de cada estrato, en orden
  de fecha, con 999 permutaciones y semilla fija. A diferencia de permutar días sueltos, conserva la dependencia entre días
  consecutivos de ambas series.
- **Dos colas.** La dirección se informa solo si la pregunta queda respaldada.

Es código nuevo y chico. Reutiliza `stats.ts` y la forma de `evaluateAssociations`; no reutiliza su permutación por
bloques de 14 días sobre todo el historial, que es la que no sostuvo los cambios de rutina (1,8 % en la compuerta estricta).

## 3. Los cinco riesgos y su control

| Riesgo | Control |
|---|---|
| **Revisiones repetidas** | La evaluación no ocurre al abrir la pantalla. Hay dos miradas, fijadas por cantidad de días pareados: `N/2` y `N`. El riesgo se reparte por Bonferroni: 0,8 % en la primera y 3,2 % en la segunda (total nominal 4 %, con margen bajo el 5 % aceptado). Entre miradas solo se muestra el avance («23 de 80 días»), nunca una diferencia parcial. Cada mirada deja un recibo inmutable. |
| **Preguntas sucesivas** | Una activa. Toda pregunta usa solo días posteriores a su creación, así que repetirla no reutiliza datos. Ninguna puede quedar respaldada antes de `N/2` días pareados, lo que limita las oportunidades a ~2 por año. Las preguntas cerradas y abandonadas quedan visibles, y el producto muestra el total acumulado («hiciste 4 preguntas; con 5 % cada una, lo esperable es 0,2 respaldos falsos»). El 5 % es por pregunta: el riesgo de por vida crece con la cantidad y se declara, no se oculta. |
| **Cambios de rutina** | Estratificación por rutina × 28 días: nunca se compara un día de una rutina con un día de otra, ni dos etapas alejadas. Una rutina nueva abre estratos nuevos. |
| **Dependencia temporal** | Los estratos de 28 días absorben tendencias y derivas lentas. El desplazamiento circular conserva la autocorrelación corta dentro del estrato. |
| **Ausencia de datos** | Faltante no es cero: un día sin exposición no entra. Si el resultado de los días sin exposición difiere del de los días con exposición en ≥ 0,15 (regla existente `selectiveAbsenceGap`), la pregunta no puede quedar respaldada y lo dice. Cobertura mínima del 50 % de los días con resultado desde la creación. Si en 24 meses no se llega a `N`, cierra como «datos insuficientes». |

**Estados de cierre:** respaldada · sin diferencia clara · datos insuficientes · registro selectivo · abandonada.
«Sin diferencia clara» nunca se redacta como «no influye».

## 4. Potencia: los 120 días no alcanzan

Para dos lados equilibrados, potencia del 80 % y la mirada final al 3,2 %, hacen falta `N ≈ 35,7 · DE / d²` días pareados.
`d` es la diferencia entre lados en desvíos estándar del resultado dentro del estrato. `DE` es la pérdida por
estratificar y por dependencia; estimo entre 1,5 y 2,5 (central 2). **`DE` no está medido: es lo primero que la
calibración tiene que establecer.**

Diferencia mínima detectable con 80 % de potencia:

| `N` final | `DE` 1,5 | `DE` 2 (central) | `DE` 2,5 | Duración estimada |
|---:|---:|---:|---:|---|
| 120 | d 0,67 | d 0,77 | d 0,86 | ~11 meses (7–15) |
| 160 | d 0,58 | d 0,67 | d 0,75 | ~15 meses (10–20) |
| 200 | d 0,52 | d 0,60 | d 0,67 | ~18 meses (12–25) |

- La duración supone 95–200 días pareados por año (3–4,5 días comparables por semana, cobertura de exposición 60–85 %).
- `d = 0,67` equivale a una correlación de ~0,32. Si el desvío del resultado dentro del estrato fuera 0,25 (**supuesto, no
  medido**), serían ~17 puntos porcentuales de diferencia en ejercicios en baja.
- El objetivo anterior («r = 0,3 con 120 días») solo se cumple en el caso ideal (`DE` ≈ 1,2). **No lo sostengo.**

**Lectura honesta:** este diseño detecta solo asociaciones personales fuertes, y tarda alrededor de un año. Las débiles
(menos de ~10 puntos) no son detectables para una persona con ningún método. Dirección debe decidir si eso justifica el
producto; la calibración es barata y da el dato que falta para decidirlo.

**Propuesta:** calibrar dos diseños, `N = 120` y `N = 160`, cada uno con sus propias miradas y su propia aceptación.

## 5. Criterio de falsa alerta

- **Evento:** una pregunta sobre un historial sin relación real llega a «respaldada» en cualquiera de sus dos miradas.
- **Aceptación:** cota superior del intervalo de Wilson al 95 % **≤ 5 %** en **cada** escenario nulo, con 2.000
  historiales por escenario. Con riesgo nominal del 4 % la cota esperada es ~4,9 %.
- **Escenarios nulos** (los primeros seis ya existen en `calibration.ts`; se generan con un candidato):
  1. independiente;
  2. autocorrelación fuerte en exposición y resultado;
  3. tendencias espurias;
  4. cambios de rutina con exposición continua;
  5. cambios de rutina con exposición binaria;
  6. ausencia selectiva;
  7. **pregunta elegida mirando el pasado** (nuevo): la exposición es la de mayor coincidencia previa entre 12, en datos con deriva;
  8. **registro escaso** (nuevo): 2 sesiones por semana y cobertura del 50 %; lo correcto es cerrar por datos insuficientes.

Los generadores deben parecerse a registros reales: 2–5 sesiones por semana, cobertura de 50–85 %, cambios de rutina cada
8–16 semanas, huecos de vacaciones y un resultado discreto (proporción sobre 3–8 ejercicios).

## 6. Criterio de potencia

- **Aceptación:** cota inferior del 95 % de detección **≥ 80 %** para `d = 0,8` con cobertura alta, en el diseño evaluado.
- **Se informa sin ser condición:** `d = 0,5` y `d = 0,65`, con cobertura alta y media, con y sin cambios de rutina.
  1.000 historiales por escenario.
- Si un diseño cumple falsa alerta y no potencia, no se construye con ese `N`.

## 7. Disciplina de validación (aprendida de #420 y #441)

- Fase de desarrollo con semillas propias, para corregir errores y medir `DE`. Nunca se reutilizan como reserva.
- Protocolo, generadores y método congelados con hash **antes** de la primera historia reservada.
- Una sola corrida reservada. Sin ajustar umbrales después de verla; si falla, se conserva el resultado y un cambio de
  método exige otro protocolo.

## 8. Calibración propuesta y coste

- **Volumen:** 8 nulos × 2.000 + 6 positivos × 1.000 = 22.000 historiales por diseño; 44.000 con los dos diseños.
- **Trabajo por historial:** 1 candidato, 2 miradas, 999 permutaciones sobre ≤ 160 puntos.
- **Estimación:** 15–45 minutos de CPU por diseño; menos de 20 minutos de reloj con 8 procesos. La referencia es #420:
  90 minutos de CPU para 9.000 historiales con 12 candidatos, 12 miradas y hasta 530 puntos. **No está medido.**
- **Tope propuesto:** 2 horas de CPU y 1 GiB de memoria en total; si se excede, se aborta sin resultado.
- **Desarrollo previo:** un PR offline (contraste estratificado, dos generadores nuevos, runner con recibos reutilizado
  de #420) y sus pruebas. Sin producción, sin Supabase, sin Mobile.
- **Coste en producción si se construye:** una evaluación por mirada (dos por pregunta en toda su vida), no por visita.
  Despreciable frente a los 12 candidatos que el motor evalúa hoy en cada lectura. No medido.

## 9. Pendientes que la calibración no resuelve

1. **Momento de registro de las métricas diarias.** `InsightsSource.metricValues` trae fecha y valor, sin instante de
   carga. Un valor cargado después de entrenar, conociendo el resultado, puede sesgar la pregunta. Antes de construir
   hace falta exponer ese instante (EXPAND) o limitar las preguntas a exposiciones con procedencia temporal (comidas con
   hora, sensaciones previas).
2. **Desvío real del resultado.** Traducir `d` a puntos porcentuales exige un único número agregado de datos reales.
   Requiere autorización expresa y no es necesario para calibrar.
3. **Redacción** de los cinco estados de cierre y del riesgo acumulado.
4. **Convivencia con «Coincidieron».** La vista actual publica coincidencias con p ≤ 0,05 sin ajustar; debe seguir
   rotulada como descripción y nunca como respaldo.

## 10. Decisión que se pide

Autorizar, o no, el PR offline de calibración de §8 para los diseños `N = 120` y `N = 160`, con los criterios de §5 y §6
y el tope de 2 horas de CPU. La interfaz no se empieza hasta ver ese resultado.
