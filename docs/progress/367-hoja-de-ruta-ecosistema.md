# #367 — Hoja de ruta del ecosistema de Insights

**Objetivo de producto:** relacionar alimentación, horarios, descanso, actividad, sensaciones, rendimiento y evolución corporal, con resúmenes claros y evidencia consultable.

Este documento fija el orden y las reglas de cada fase. **Lo que dice «diseño» no está implementado.** El estado real de cada fila está en la [matriz](367-matriz-cobertura.md).

## Reglas comunes

- **Un resultado nuevo es una familia nueva**, con su propia calibración. Nunca hereda la del rendimiento.
- **Primero se fija** la unidad, la elegibilidad, la temporalidad y la dependencia; después se miran resultados.
- **Las ventanas y los umbrales se eligen antes**, con su justificación. No se busca después la ventana que dé el resultado más llamativo. Las alternativas se muestran como sensibilidades, nunca reemplazan a la preregistrada.
- **Datos:**
  - faltante ≠ cero;
  - vacío ≠ no disponible;
  - una comida sin registrar no es ayuno, y un día con comidas no es un día completo.
- **Presentación:** los filtros nunca disparan una búsqueda nueva de patrones. Filtran lo ya evaluado.
- **Frases:** determinísticas, breves y neutrales. «En tus registros, X coincidió con Y.» Con acceso a los días, las fechas, las exclusiones y la incertidumbre. Sin causalidad, rangos óptimos, recomendaciones ni cambios de rutina.
- **«Consistente» sigue deshabilitado.**

## Fase 1 — Energía y fatiga al terminar (esta entrega)

Ver [367-sensaciones-resultado-metodo.md](367-sensaciones-resultado-metodo.md).
- **Publicado:** la descripción (`view=feelings`) y la pantalla «Cómo terminaste».
- **Sin publicar ni preparar en las vistas:** las asociaciones. La calibración no alcanza el objetivo de validación propuesto (1 %, no aprobado como tolerancia) con cambios de rutina y tendencias, ni tampoco en los nulos.

## Fase 2 — Alimentación y tiempo (siguiente incremento, diseño)

**Lo que ya existe:**
- totales del día y del día anterior para los cuatro macros, «mismo día, sin orden»;
- carbohidratos con hora explícita en las 3 h antes del inicio (`meal_window:carbsG:pre_3h`), con sensibilidades de 2 h y 4 h, con hora de registro y con hora no verificada;
- carbohidratos del día antes del inicio (`same_day_before_start`);
- **procedencia de la hora:** explícita (declarada o importada), de registro (aproximada), no verificada y desconocida (`mealTimeEvidence`).

**Distinciones que el diseño conserva:**
- **Total del día ≠ consumo demostrablemente previo.** Solo una comida con hora explícita anterior al inicio cuenta como previa. Una comida sin hora en el alcance de la ventana anula la ventana (`untimed_meal_in_scope`); no se reparte ni se adivina.
- **Cantidad, distancia temporal y distribución** son exposiciones distintas. No se combinan en un índice.
- **Medianoche:** las ventanas son instantes, no fechas. Una comida de las 23:00 del día anterior cuenta para un entrenamiento a la 1:00.
- **Varias sesiones en un día:** quedan afuera, como hoy, hasta definir la sesión de referencia del día con su propia regla.

**Conjunto inicial propuesto**, tres candidatos nuevos y nada más:

| Candidato | Qué mide | Por qué este y no otros |
| --- | --- | --- |
| `meal_window:proteinG:pre_3h` | Proteína con hora explícita en las 3 h previas | Misma ventana preregistrada que los carbohidratos, otro macro. Sin ventanas nuevas |
| `meal_window:calories:pre_3h` | Calorías con hora explícita en las 3 h previas | Separa cantidad total de composición sin sumar macros |
| `meal_timing:hours_since_last_explicit:pre_start` | Horas desde la última comida con hora explícita antes del inicio, hasta 12 h | La distancia temporal. Solo cuando no hay comidas sin hora ese día ni el anterior antes del inicio. Si no, «sin dato», nunca «ayuno» |

**Fuera del conjunto inicial:**
- **grasas en ventana:** quedan para después del primer resultado;
- **distribución del día** (parte de lo registrado antes del inicio): depende de que el día esté completo, y eso no se sabe (`ingestionCompleteKnown: false`);
- **ventanas de 1 h o 6 h** como primarias;
- **cualquier combinación de ventana y macro** no listada.

**Validación:**
- recalcular la calibración de las familias afectadas (rendimiento estricto, parcial y, si se publican, sensaciones), con 3 candidatos más por familia;
- el escenario de [tamaño de familia](367-insights-pr4-motor.md) ya mide 12 contra 14 candidatos y se extiende a 17.

## Fase 3 — Evolución corporal (diseño)

- **Resultado nuevo e independiente:** el cambio de peso corporal.
  - **Unidad:** la semana. Un día no tiene evolución corporal.
  - **Medida:** la diferencia entre la mediana de los pesos de la semana y la de la anterior, con al menos 3 pesos válidos en cada una. Sin interpolar semanas vacías.
  - **Peso válido:** el de Cuerpo, positivo. 0 kg es inválido, nunca «nada».
- **Exposiciones de períodos anteriores:**
  - calorías registradas medias de la semana anterior, con cobertura mínima de días con comidas, y la cobertura a la vista;
  - entrenamientos y series completas de la semana anterior.
  - Nunca la misma semana: el orden temporal se respeta.
- **Contra tendencias espurias:**
  - no se correlacionan dos tendencias;
  - la unidad es el cambio semanal, y se quita la tendencia local;
  - permutaciones por bloques de semanas y la rutina como estrato;
  - su propia calibración, con escenarios de deriva lenta.
- **Alcance de una asociación semanal:** nunca explica una sesión. La frase habla de semanas.

## Fase 4 — Resúmenes de período (diseño)

- **Períodos fijos:** 3 meses, sin elegir el inicio por el resultado.
- **Qué se muestra:**
  - cobertura por fuente;
  - denominadores en cada número;
  - cambios de rutina marcados en el tiempo;
  - la tendencia temporal de cada resultado, por separado de cualquier asociación.
- **Lo que no es:** una búsqueda nueva. Muestra lo ya evaluado en el período, con sus exclusiones. Un período sin datos suficientes lo dice.

## Orden y dependencias reales

1. **Fase 1:** esta entrega. Descripción publicada; asociaciones a la espera de un método que pase la calibración.
2. **Fase 2:** un PR del motor con su calibración. No depende de la fase 1, salvo para recalibrar las sensaciones si se publican antes.
3. **Fase 3:** un PR del motor. La UI va en su propio PR, porque es una pantalla nueva en Cuerpo.
4. **Fase 4:** depende de las fases 2 y 3 para tener algo que resumir.

Ninguna fase necesita migraciones: todo sale de datos ya registrados.
