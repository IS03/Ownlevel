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

Corridos después del preregistro (`c68d6ba`), con lo que fijó ese commit. No se cambió ninguna ventana, umbral, tamaño ni escenario.

### Lo que se publica

- **Contexto de la sesión** (`SessionFact.context.preStart`, opcional): proteína y calorías registradas en 3 h, y la última comida registrada con hora explícita en 12 h, cada una con su estado. Mobile las muestra como filas separadas, con el motivo cuando falta el valor.
- **Equivalencia con `main`** (`equivalence-fingerprint.test.ts`): sin `preStart`, **53 de 53** vistas son idénticas. Con el campo cambian solo las 23 que llevan sesiones.
- **Costo:** sin consultas nuevas. Los valores salen de las comidas que la lectura ya trae, en el mismo recorrido que los carbohidratos.

### Candidatos que el motor realmente evalúa

Historias sintéticas de `scale-fixture.ts`, método 2. «Evaluables» son los que pasan el mínimo de pares y de variación (`testable`).

| Cuenta | Definidos | Evaluables, carril estricto (con horas explícitas) | Evaluables, carril parcial (sin horas explícitas) |
| --- | --- | --- | --- |
| Sin métricas, 2 años | 13 → 16 | 9 → 11 | 7 → 7 |
| 5 métricas, 2 años | 23 → 26 | 19 → 21 | 17 → 17 |
| 20 métricas, 5 años | 53 → 56 | 49 → 51 | 47 → 47 |

- **Sin horas explícitas** los candidatos nuevos no suman nada evaluable.
- **Con horas explícitas** suman 2. El tiempo desde la última comida no varía en esta historia: las comidas tienen horario fijo.
- **No hay una familia típica de 17:** depende de las métricas de cada cuenta y de qué hay registrado.

### Calibración (`family-extension.campaign.test.ts`)

**Carril estricto:** pareado, el mismo historial con y sin los 3 candidatos. 500 historiales por escenario, semilla `0x3672`.

| Escenario | Familia | Algún exploratorio | Compuerta estricta | Wilson sup. 95 % |
| --- | --- | --- | --- | --- |
| Independiente | 13 → 16 | 1,8 % → 6,2 % | 0 % → 0 % | 0,76 % → 0,76 % |
| Independiente | 23 → 26 | 2,0 % → 8,6 % | 0 % → 0 % | 0,76 % → 0,76 % |
| Dependencia temporal | 13 → 16 | 3,4 % → 9,2 % | 0 % → 0 % | 0,76 % → 0,76 % |
| Dependencia temporal | 23 → 26 | 6,8 % → 12,4 % | 0,2 % → 0,2 % | **1,12 % → 1,12 %** |
| Tendencias espurias | 13 → 16 | 22,2 % → 31,4 % | 0,8 % → 0 % | 2,04 % → 0,76 % |
| Tendencias espurias | 23 → 26 | 38,2 % → 44,8 % | 0,8 % → 0 % | 2,04 % → 0,76 % |
| Cambios de rutina | 13 → 16 | 24,2 % → 28,4 % | 0,8 % → 0,2 % | 2,04 % → 1,12 % |
| Cambios de rutina | 23 → 26 | 37,8 % → 43,2 % | 1,6 % → 0 % | 3,13 % → 0,76 % |
| Ausencia selectiva | 13 → 16 | 0 % → 6,4 % | 0 % → 0 % | 0,76 % → 0,76 % |
| Ausencia selectiva | 23 → 26 | 0 % → 5,4 % | 0 % → 0 % | 0,76 % → 0,76 % |

**Carril parcial:** no pareado. 300 historiales, semilla `0x3673`.

| Escenario | Familia | Algún exploratorio | Compuerta estricta | Wilson sup. 95 % |
| --- | --- | --- | --- | --- |
| Sin cambios ocultos | 13 | 0,7 % | 0 % | 1,26 % |
| Sin cambios ocultos | 16 | 1,7 % | 0 % | 1,26 % |
| Cambios ocultos 15 % | 13 | 0,3 % | 0 % | 1,26 % |
| Cambios ocultos 15 % | 16 | 2,0 % | 0,3 % | 1,86 % |

### Decisión: no valida

- **Condición 1 (estricto): no se cumple.**
  - **La compuerta estricta no empeora** en ningún caso: con más candidatos el máximo de la familia es más exigente, y baja (por ejemplo 1,6 % → 0 % con cambios de rutina).
  - **«Algún exploratorio» sube** entre 4,2 y 9,2 puntos en todos los escenarios y tamaños, por encima del límite de +2. En el pareado, la familia ampliada agrega un exploratorio que la base no tenía en 4,2 % a 9,2 % de los historiales, y nunca quita uno.
- **Condición 2: no se cumple en un tamaño.** Dependencia temporal con 26 candidatos da una cota de 1,12 % (la misma que la base con 23). El 1 % sigue siendo el objetivo propuesto, no una tolerancia aprobada.
- **Condición 3 (parcial): se cumple.** Exploratorio +1,0 y +1,7 puntos; estricta +0,0 y +0,3.

**Consecuencia, como se preregistró:**
- los tres candidatos quedan fuera de las familias públicas y de su preparación en las vistas. Solo se construyen con `buildExposureTable(..., mealTiming = true)`, que ninguna vista llama;
- se publican solo los valores del contexto de la sesión.

**Lo que no se hizo:** no se ajustaron ventanas, umbrales, presencia ni tamaños para que pase.

**Una lectura posible, sin cambiar la decisión:** el aumento del exploratorio es mayor que lo que tres candidatos independientes harían esperar. Los nuevos están presentes en el 40 % de los días, con menos pares, y el exploratorio no corrige por familia. Es una hipótesis para un método futuro, no una razón para reinterpretar este resultado.

### Validación

- **Pruebas nuevas:**
  - **motor:** medianoche, cero registrado, calorías sin reconstruir, macro desconocido, hora de registro y no verificada, alcance de 12 h contra la regla publicada de los carbohidratos, censura, varias sesiones, y candidatos fuera de las familias públicas;
  - **contrato:** `preStart` opcional y validado;
  - **Mobile:** filas, motivos, servidor anterior y formato de duraciones;
  - **calibración:** la familia base de la ampliación es exactamente la de `calibrationSteps`, y es reproducible.
- **Pruebas que pasan:**
  - Web (motor, comparador, contrato y ruta): 411 de 412 con la campaña corriendo en paralelo. La que falló, `evidence.test.ts`, superó el tiempo bajo esa carga y pasa sola (11 de 11);
  - Mobile Insights: 59.
- **Tipos y lint:** sin errores en Web y Mobile.
