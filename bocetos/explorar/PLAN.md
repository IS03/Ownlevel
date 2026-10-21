# Progreso · etapa 2: Explorar y Mis vistas (plan por partes)

Bocetos: `bocetos/explorar/` (S1–S7, fila y=22000 de `bocetos.entrenar.pen`). Galería: https://claude.ai/artifact/Rp5QQ1XNW8sHVWhJnwonE2

Base: la etapa 1 (pasos 1 a 6, PRs #233–#240):
- período y comparación compartidos;
- `ProgressScroll`;
- filas planas;
- `PeriodChart`;
- lecturas de entrenamiento, nutrición, franjas, cuerpo y métricas.

Cada paso es un PR propio y se prueba en el iPhone antes del siguiente.

## Decisiones

- **Una vista no guarda fechas.** Sigue el período y la comparación de Progreso.
- **Hasta 6 vistas.** El servidor hace cumplir el límite.
- **Una consulta es medida × desglose × días**, siempre dentro del período elegido. El desglose es opcional y el filtro de días también.
- **Explorar no tiene entrada fija en el resumen.** Se llega desde "+ Nueva vista" y desde Mis vistas vacía.
- **Qué influye** (cruzar dos medidas con días de desfase) y **los avisos automáticos** son la etapa 3, con bocetos propios.

## Medidas, desgloses y filtros

| Medida | Cómo se resume en el período | Desgloses | Filtro de días |
|---|---|---|---|
| Series, sesiones, duración | Suma; 0 es real (no entrenaste) | rutina, músculo, ejercicio, día de la semana | días de trabajo |
| Mejor serie de un ejercicio | Mejor por sesión (regla actual por modo de carga) | — | — |
| 1RM estimado de un ejercicio | Epley con 1 a 12 reps, solo kg, siempre "estimado" | — | — |
| Calorías, proteína, carbohidratos, grasas | Promedio por día completo con registro | momento de la comida, franja horaria, día de la semana | con o sin entrenamiento; de trabajo o no |
| Agua, pasos, sueño y métricas propias | Promedio por día con dato; 0 registrado cuenta | día de la semana | con o sin entrenamiento; de trabajo o no |
| Peso y medidas | Primer → último registro; un punto por registro | — | — |

Reglas de datos:
- **Por momento de la comida:** sobre días completos con registro. Un momento sin comidas ese día cuenta como 0 (esa comida no existió). Las comidas sin momento no entran y se cuentan aparte ("3 comidas sin momento"). La suma de los momentos da el promedio del día.
- **Por día de la semana:** promedio por cada lunes, martes… del período, con el mismo criterio de la medida (suma con 0 real en entrenamiento; solo días con dato en nutrición y métricas).
- **Filtro de días:**
  - con entrenamiento = día con una sesión completada;
  - de trabajo = `work_effective_snapshot`;
  - si el dato de trabajo falta, el día no entra en ninguno de los dos grupos.
- **Cobertura:** cada resultado dice cuántos días entraron ("12 días de 15"). Sin dato ≠ 0, siempre.
- **Varias series en el tiempo** (S5): un desglose más el bucket del período (día, semana o mes). Se muestran hasta 4 grupos en filas con la misma escala, y el usuario elige cuáles.

## Pasos

| Paso | Qué | Bocetos | Servidor |
|---|---|---|---|
| 1 | **Lectura "explorar"** (solo servidor y contrato, sin pantalla) | — | **EXPAND de lectura, sin migración:** `GET /api/mobile/v1/progress/explore`. Ver abajo |
| 2 | **Explorar en la app:** arranque con ideas, los tres renglones, hoja para elegir la medida, resultado con desglose (barras con etiqueta) y varias series (small multiples) | S2–S5 | Usa el paso 1 |
| 3 | **Vistas guardadas** (solo servidor) | — | **EXPAND con migración.** Ver abajo |
| 4 | **Mis vistas en la app:** arriba del resumen, fijar desde Explorar, editar (ordenar, renombrar, sacar) y estado vacío | S1, S6, S7 | Usa el paso 3 |
| 5 | **Etapa 3: Qué influye** | por diseñar | Usa la lectura del paso 1 |
| 6 | **Etapa 4: avisos automáticos**, solo con muchos datos y diferencias claras | por diseñar | Usa la lectura del paso 1 |

### Paso 1 · Lectura "explorar"
- **Parámetros:**
  - los del resto de Progreso (`period`, `from`/`to`, `compareFrom`/`compareTo`);
  - `measure` (por ejemplo `training.sets`, `nutrition.protein`, `metric.<id>`, `exercise.<id>.e1rm`);
  - `breakdown` opcional;
  - `days` opcional;
  - `series=1` opcional, para la vista en el tiempo.
- **Combinaciones inválidas** (por ejemplo un desglose que la medida no admite) = 400 con mensaje claro.
- **Respuesta:**
  - total del período: valor, unidad, cómo se resumió, cobertura y `derived` (para el 1RM);
  - grupos del desglose: clave, etiqueta, valor y cobertura;
  - con `series=1`, buckets por grupo;
  - con comparación, lo mismo para el período de comparación;
  - las comidas sin momento, contadas aparte.
- **Implementación:**
  - reusa los lectores que ya existen: `loadTrainingContext`, `readMobileNutritionFacts`, `readNutritionTiming`, el reporte de métricas y el de cuerpo;
  - una lectura por fuente, sin SQL nuevo;
  - identidad por Bearer;
  - parser estricto antes de responder.
- **Catálogo:** la lista de medidas y qué desgloses admite cada una vive en el contrato, compartido entre la app y el servidor. Las métricas propias y los ejercicios salen de lecturas existentes.

### Paso 3 · Vistas guardadas
- **Migración:** tabla `progress_views` con:
  - `id`, `user_id`, `position`, `name`;
  - `definition` (jsonb con measure, breakdown, days, series y los grupos elegidos);
  - `version`, `created_at`, `updated_at`.
  - RLS solo del dueño. Sin `service_role`.
- **API Mobile v1:**
  - **listar con datos:** `GET /progress/views?period=…` devuelve cada vista con su resultado, en una sola lectura;
  - **crear:** idempotente con clave; rechaza la séptima;
  - **renombrar:** con CAS (`version`);
  - **reordenar:** con CAS sobre la lista;
  - **sacar.**
- **La definición se valida contra el catálogo del paso 1.** Si una métrica o un ejercicio dejó de existir, la vista queda marcada "no disponible" (no vacía) y se puede sacar.
- **Rollout:** EXPAND (tabla y endpoints) → ADOPT (la app del paso 4). La migración se aplica antes del deploy del paso 3.

## Reglas que cruzan todos los pasos

- **Sin comparar por defecto.** La comparación es la de Progreso.
- **Datos fieles:**
  - sin dato ≠ 0;
  - cobertura siempre visible;
  - flechas neutras, sin colores de bueno o malo;
  - nunca volumen global en toneladas (mezcla kg, lingotes y peso corporal);
  - el 1RM siempre "estimado".
- **Gráficos:**
  - una serie = champagne, más el período de comparación en gris;
  - hasta 4 series con etiqueta directa;
  - con más, se eligen;
  - nunca un arcoíris.
- **Copy:** neutro, voseo, sin juzgar comida, peso ni entrenamiento.
