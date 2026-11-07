# #367 — Fase 2: alimentación horaria antes del entrenamiento

**Preregistro.** Este documento se escribió y se commiteó antes de construir los candidatos y de correr cualquier calibración. La sección «Resultados» se agrega después y no cambia nada de lo de arriba.

Hoja de ruta: [367-hoja-de-ruta-ecosistema.md](367-hoja-de-ruta-ecosistema.md). Reglas comunes de AGENTS.md: faltante ≠ cero, vacío ≠ no disponible, sin causalidad.

## Valores

Tres valores por sesión, del lado del contexto de la sesión. Cada uno es independiente: cantidad, composición y distancia temporal nunca se combinan.

| Valor | Qué es | Unidad |
| --- | --- | --- |
| Proteína en las 3 h previas | Suma de `final_protein_g` de las comidas con hora explícita en [inicio − 3 h, inicio) | g |
| Calorías en las 3 h previas | Suma de `final_calories` registradas de esas comidas. **Nunca se reconstruyen desde los macros** | kcal |
| Tiempo desde la última comida registrada con hora explícita | Inicio − hora de la última comida con hora explícita en [inicio − 12 h, inicio) | h |

**Las 3 h y las 12 h son decisiones de producto fijadas antes**, no óptimos fisiológicos. Las 3 h son la ventana primaria que ya usan los carbohidratos (`PRIMARY_MEAL_WINDOW_HOURS`), con sus sensibilidades de 2 h y 4 h. Las 12 h solo acotan cuánto hacia atrás se busca.

## Reglas

- **La misma agregación que los carbohidratos** (`mealWindow` en `exposures.ts`): el mismo alcance de fechas (el día lógico de la sesión y el anterior), la misma procedencia de la hora (`mealTimeEvidence`) y la misma decisión de qué comida queda adentro. Cambia solo el nutriente sumado.
- **Solo consumo anterior al inicio.** Las ventanas son instantes, no fechas: una comida a las 23:00 del día anterior cuenta para un entrenamiento a la 1:00.
- **Hora explícita:** declarada o importada. La hora de registro es aproximada y no cuenta como explícita. Una hora no verificada tampoco.
- **Una comida sin hora explícita que pueda caer en la ventana** no se reparte ni se adivina. El valor queda sin dato, con el motivo:
  - `untimed_meal_in_scope`: comida sin hora o con hora de registro;
  - `unverified_meal_time_in_scope`: hora no verificada.
- **Para las 3 h**, igual que en los carbohidratos:
  - cualquier comida sin hora explícita del día de la sesión;
  - o una con instante dentro de la ventana.
- **Para las 12 h** la ventana suele cruzar al día anterior, así que también cuenta una comida sin hora del día anterior. **Esta es la única diferencia con los carbohidratos**: no se aplica a los carbohidratos para no cambiar sus resultados publicados. Queda como límite conocido de la ventana de 3 h.
- **Un macro desconocido impide afirmar el total.** Si una comida de la ventana no tiene el dato, el valor es `partial_macro`, sin dato.
- **Un cero explícito válido es un cero:** «0 g» registrado se conserva. Una ventana sin comidas es `no_registered_meal`, sin dato, nunca 0.
- **«Última comida registrada» no es «última comida consumida».** Si no hay ninguna comida con hora explícita en las 12 h, el valor es `no_explicit_meal_in_12h`: censurado, sin dato. Nunca «12 h» ni «ayuno».
- **Sin hora de inicio de la sesión:** `no_start_time`.
- **Varias sesiones en un día:** el contexto se muestra en cada sesión, pero quedan excluidas de las asociaciones (`multiple_sessions_day`), como hoy.

## Candidatos de asociación

| Id | Valor | Elegible si |
| --- | --- | --- |
| `meal_window:proteinG:pre_3h` | proteína en 3 h | día de una sesión, con hora de inicio, valor `recorded` |
| `meal_window:calories:pre_3h` | calorías en 3 h | ídem |
| `meal_timing:hours_since_last_explicit:pre_start` | horas desde la última comida con hora explícita | ídem, sin comidas sin hora o no verificadas en el alcance |

- Protein y calorías llevan las mismas sensibilidades que los carbohidratos: ventanas de 2 h y 4 h, hora de registro y hora no verificada. Nunca reemplazan al valor preregistrado.
- **Familias afectadas:** las dos de rendimiento, estricta y parcial. Las sensaciones al terminar siguen deshabilitadas y no se recalibran.

## Validación preregistrada

**Tamaño real de la familia.** No es fijo. Con el método 2, por cuenta:
- 2 candidatos por métrica, o 3 si es la de sueño;
- 8 de nutrición diaria;
- 2 de ventanas de carbohidratos;
- 1 de peso;
- 2 de sensaciones previas.

Una cuenta sin métricas tiene 13 y una con 5 métricas tiene 23. Los nuevos suman 3. Además se cuentan los candidatos que el motor efectivamente evalúa (`testable`) en historias sintéticas, antes y después.

**Simulación:**
- `calibration.ts`, con la misma política;
- los 3 candidatos nuevos se agregan desde un generador aparte, así el mismo historial se evalúa con y sin ellos;
- dos se parecen a la ventana de carbohidratos:
  - proteína, ρ ≈ 0,7;
  - calorías, ρ ≈ 0,85;
- el tiempo desde la última comida es independiente;
- los tres están presentes en el 40 % de los días, los mismos días entre sí.

**Escenarios:**
- independiente;
- dependencia temporal;
- tendencias espurias;
- cambios de rutina;
- ausencia selectiva.

**Tamaños:** 13 → 16 y 23 → 26, con 500 historiales, 24 meses, 12 actualizaciones y 199 permutaciones. El carril parcial se mide con `partial-calibration.ts`: 13 contra 16 candidatos, 300 historiales, sin cambios ocultos y con 15 %.

**La ampliación valida solo si se cumplen las tres condiciones:**
1. **No empeora la familia** en ningún escenario ni tamaño. Diferencia pareada en la compuerta estricta ≤ +0,5 puntos, y en «algún exploratorio» ≤ +2 puntos.
2. **Nulos sin deriva:** en independiente, dependencia temporal y ausencia selectiva, la cota de Wilson de la compuerta estricta con la familia ampliada queda ≤ 1 %.
   - El 1 % es el **objetivo de validación propuesto**, no una tolerancia aprobada.
3. **El carril parcial** cumple la condición 1 con sus escenarios.

**Si no valida:**
- los candidatos nuevos quedan fuera de las asociaciones públicas y de su preparación en las vistas;
- se publican solo los valores del contexto de la sesión.

**Si valida:** se agregan a las dos familias de rendimiento en un PR propio, con su descripción.

Ninguna ventana ni umbral se elige por el resultado.

## Resultados

*(Se completa después de correr la calibración.)*
