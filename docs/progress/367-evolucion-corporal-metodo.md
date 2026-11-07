# #367 — Fase 3: evolución semanal del peso corporal

**Preregistro.** Este documento se escribió y se commiteó antes de implementar el método y de correr cualquier calibración. La sección «Resultados» se agrega después y no cambia nada de lo de arriba.

Hoja de ruta: [367-hoja-de-ruta-ecosistema.md](367-hoja-de-ruta-ecosistema.md). Reglas de AGENTS.md: faltante ≠ cero, sin causalidad, sin juicios sobre subir o bajar.

## Descripción (`body-weekly/1`)

- **Fuente:** el peso del día (`day_logs.weight_kg`), el mismo que lee Cuerpo para el período elegido. **No se agrega ninguna lectura.**
  - **Peso válido:** la regla canónica de Cuerpo para escribir un peso (`isNewBodyWeight`): mayor que 0, finito, hasta 999,99 kg y con dos decimales como máximo.
  - Un 0 kg guardado no es un pesaje: se cuenta aparte, como inválido.
- **Semana:** de lunes a domingo, en fechas lógicas de Córdoba.
  - Solo semanas enteras dentro del período. Una semana cortada por el borde del período no se muestra como semana: tendría menos pesajes de los que tuvo.
  - **La semana en curso queda afuera.**
- **Por semana:** los pesajes válidos con sus fechas, su cantidad y su mediana. Con menos de 3 no hay mediana.
- **El mínimo de 3 es una regla de producto**, no una garantía científica.
- **Cambio:** la mediana de la semana menos la de la semana inmediatamente anterior, si las dos tienen mediana.
  - Nunca entre semanas separadas.
  - Una semana vacía o con menos de 3 pesajes no se interpola ni se saltea: corta la cadena, y el cambio siguiente dice por qué no existe.
- **Peso corporal no es carga levantada:** la descripción vive en Cuerpo, en kg de peso del cuerpo, y no se cruza con el entrenamiento.
- **Sin juicios:** el cambio se muestra con flecha y magnitud, sin color ni palabras como «mejor» o «peor».

## Análisis experimental (`insights-body-weekly/1`)

**No se publica.** Ninguna vista lo prepara: corre solo en pruebas y en su calibración.

### Unidad y resultado

- **Fila:** un cambio semanal válido entre la semana W−1 y la semana W, fechado con el lunes de W.
- **Resultado:** ese cambio, en kg.

### Exposiciones

Fijadas aquí, cuatro, todas de la **semana W−1**: la anterior del par, la que termina antes de que empiece W.

| Id | Qué es | Elegible si |
| --- | --- | --- |
| `body_week:calories:previous_week` | Calorías registradas por día con comidas, media de la semana W−1 | W−1 tiene comidas en al menos 4 días |
| `body_week:proteinG:previous_week` | Proteína registrada por día con comidas, media de W−1 | ídem |
| `body_week:sessions:previous_week` | Entrenamientos terminados en W−1 | siempre: 0 entrenamientos es un cero real |
| `body_week:sets:previous_week` | Series completadas en W−1 | siempre |

**Cobertura alimentaria:**
- se informa la cantidad de días con comidas de la semana;
- un día sin comidas no es consumo cero y no entra en la media;
- lo registrado no es la ingesta completa.

**Un macro desconocido** en un día deja ese día fuera de la media de ese macro.

**Superposición conocida:** la mediana de W−1 y la exposición de W−1 comparten semana. El método no lo resuelve, y las frases nunca dicen que la exposición vino antes que todo el cambio.

### Dependencia y confusión

- **Dos cambios consecutivos comparten una semana** (W−1→W y W→W+1 comparten W), así que no son independientes. Se usan las permutaciones por bloques de la política de asociaciones: bloques de 14 filas, unas 14 semanas.
- **Que las diferencias sean semanales no elimina la confusión temporal:**
  - la política quita la tendencia local (28 días, unas 4 semanas);
  - la calibración incluye tendencias espurias y cambios de rutina;
  - nunca se correlacionan dos tendencias en crudo.
- **Ausencia selectiva:** pesarse menos en algunas semanas, o registrar comidas solo en algunas, cambia qué filas existen. Se mide en la calibración.
- **La política de asociaciones se usa sin cambios** (`ASSOCIATION_POLICY`): mínimo de 20 pares, compuertas y corrección por familia. Solo cambia la fila: un cambio semanal en lugar de un día.

### Calibración preregistrada

- **Recorrido real desde datos fuente:** se simulan filas como las de la base (pesos diarios, comidas, sesiones y series) y se corre el mismo código que describe las semanas y arma las exposiciones.
- **Simulación:**
  - 24 meses;
  - pesaje un día de cada dos;
  - error de medición de 0,4 kg;
  - comidas registradas el 70 % de los días;
  - 3 a 4 entrenamientos por semana;
  - 500 historiales y 12 actualizaciones en el último año;
  - 199 permutaciones, semilla `0x367e`.
- **Escenarios:**
  - independiente;
  - dependencia temporal: el peso como paseo aleatorio y la alimentación autocorrelacionada;
  - tendencias espurias: peso y alimentación con deriva lenta;
  - cambios de rutina: eras de 6 meses que mueven entrenamientos, alimentación y peso;
  - ausencia selectiva: menos pesajes y menos comidas registradas en las semanas en que el peso sube;
  - efecto plantado, para la potencia: las calorías de W−1 mueven el cambio W−1→W.

**Criterios:**
1. **Nulos sin deriva** (independiente, dependencia temporal y ausencia selectiva): la cota de Wilson al 95 % de la compuerta estricta queda ≤ 1 %. El 1 % es el **objetivo de validación propuesto**, no una tolerancia aprobada.
2. **Se informan siempre** tendencias espurias, cambios de rutina, «algún exploratorio» y potencia.

**Publicación:**
- aunque el criterio 1 se cumpla, las asociaciones no se publican en esta entrega. Hacerlo es una decisión de producto, en un PR propio;
- si no se cumple, se documenta y el método queda experimental.

**«Consistente» sigue deshabilitado.** Ningún umbral se ajusta por el resultado.

## Resultados

Corridos después del preregistro (`baaa94d`), con lo que fijó ese commit. No se cambió ninguna regla, umbral ni escenario.

### Lo que se publica

- **«Semana a semana» en Cuerpo, debajo del gráfico de peso** (`apps/mobile/src/progress/weekly-weights.tsx`). Usa el módulo compartido `src/lib/progress/body-evolution/weekly.ts`. Por semana:
  - mediana, o «Sin mediana»;
  - pesajes con su día;
  - cambio frente a la semana anterior, con flecha y magnitud, o por qué no lo hay.

  Al pie dice cuántos pesajes quedaron afuera por caer en semanas incompletas o en curso.
- **Costo:**
  - sin consultas nuevas y sin cambios de contrato: usa los pesos del período que Cuerpo ya lee (`fetchProgressBody`);
  - `parseProgressBody` exige claves exactas, así que agregar un campo a esa respuesta rompería clientes instalados: se evitó;
  - calcular un año de pesajes diarios (52 semanas, 51 cambios) toma de 0,3 a 0,7 ms por llamada, medido con otros procesos en paralelo.

### Análisis experimental

**Recorrido:** `prepareBodyWeeklyAssociations` (`analysis.ts`) recibe filas fuente (`InsightsSource` y los pesos del día) y usa la misma descripción. Ninguna vista lo llama: el snapshot de Insights y sus vistas no lo contienen.

**Calibración** (`calibration.ts`, `analysis.test.ts`): simula filas fuente y corre el mismo código. 500 historiales por escenario, 24 meses, 12 actualizaciones, 199 permutaciones, semilla `0x367e`. Unos 22 s por escenario.

| Escenario | Cambios al final | Días con comidas por semana | Algún exploratorio | Compuerta estricta | Wilson sup. 95 % |
| --- | --- | --- | --- | --- | --- |
| Independiente | 62 | 4,9 | 12,6 % | 0,6 % | **1,75 %** |
| Dependencia temporal | 62 | 4,9 | 11,4 % | 0,2 % | **1,12 %** |
| Tendencias espurias | 62 | 4,9 | 12,2 % | 0,6 % | 1,75 % |
| Cambios de rutina | 62 | 4,9 | 10,0 % | 0,4 % | 1,45 % |
| Ausencia selectiva | 27 | 4,4 | 0 % | 0 % | 0,76 % |
| Efecto plantado (calorías de W−1) | 62 | 4,9 | 52,4 % | 14,2 % | — |

- **Candidato de calorías en el efecto plantado:** exploratorio en 47,0 % y compuerta estricta en 13,8 %. En los nulos, exploratorio entre 0 % y 3,4 % y nunca la estricta.
- **Ausencia selectiva:** deja menos de la mitad de las filas (27 contra 62). Su 0 % viene de tener pocas filas, no de un método robusto.

### Decisión: no valida

- **Criterio 1: no se cumple.** La cota de Wilson de la compuerta estricta queda por encima del 1 % en independiente (1,75 %) y en dependencia temporal (1,12 %). El 1 % es el objetivo propuesto, no una tolerancia aprobada.
- **El análisis queda experimental y sin publicar.** No se ajustó ningún umbral para que pase.
- **Lo que se aprende, sin cambiar la decisión:**
  - con unos 60 cambios semanales en 2 años, la potencia frente a un efecto moderado es baja (47 % exploratorio);
  - «algún exploratorio» ronda el 12 % en los nulos con solo 4 candidatos, por las 12 actualizaciones.

  Un método futuro necesitaría más semanas por cuenta o menos miradas, con su propio preregistro.

### Validación

- **Pruebas nuevas:**
  - **descripción:** semanas enteras, semana en curso, bordes del período, 0 kg inválido, mínimo de 3, mediana par, nunca entre semanas separadas;
  - **análisis:** exposiciones de W−1, cobertura de comidas, día sin comidas o valor desconocido nunca como cero, 0 entrenamientos como cero real, y que ninguna vista lo prepara;
  - **calibración:** reproducible, y el efecto plantado se detecta más que el nulo;
  - **Mobile:** filas, fechas, cambio, afuera, sin juicios y estado vacío.
- **Pruebas que pasan:** cuerpo y Progreso en Mobile, 83 en las suites existentes más 3 nuevas. Las suites de Web de esta fase también pasan.
- **Tipos y lint:** sin errores en Web y Mobile.
