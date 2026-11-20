# Orden de la rutina (`view=routine-order`)

Pregunta: ¿a partir de qué ejercicio de una rutina baja tu rendimiento? La respuesta es descriptiva: muestra dónde coincide la baja, no afirma que el orden la cause. Sigue vigente el cierre de #367: no hay inferencia nueva y «consistente» sigue deshabilitado.

## Datos
- **Orden:** el `exercise_order` de cada sesión tal como quedó, incluido lo que se movió durante la sesión (`mobile_reorder_workout_exercises`). Las posiciones van de 1 a n y los huecos se cierran.
- **Progreso:** el cambio medido de #533 (`change.pct`, reps a igual peso frente a la vez anterior, en los dos carriles). Solo entran las bases de repeticiones. Las subidas de peso quedan aparte.
- **Objetivo:** las series completadas que tienen `target_reps` > 0 y reps registradas. Una serie llega si `actual_reps ≥ target_reps`. Sin objetivo no cuenta, nunca es 0 %.
- **Ventana:** los últimos 90 días lógicos y solo sesiones completadas de la rutina.
- **Lectura:** el snapshot del método 2 en caché, más una lectura propia de los bloques de esa rutina (por usuario, rutina, estado y fecha), bajo el mismo contador de revisión. Si la revisión cambia entre las dos lecturas, se reintenta una vez; si vuelve a cambiar, la vista queda no disponible.

## Cortes
- **Base:** las posiciones 1–2 juntas. En progreso es la mediana de sus cambios; en objetivo, la proporción de series que llegaron. Necesita 5 cambios de 3 sesiones, o 9 series con objetivo de 3 sesiones. Con menos, el estado es `insufficient`. Si la base de progreso es menor a 0,5 % por sesión, el estado es `no_baseline`: no hay desde dónde medir una baja.
- **Pérdida:** en progreso es relativa (`1 − valor/base`); en objetivo se mide en puntos (`base − tasa`). Cada posición necesita los mismos mínimos que la base.
- **Primer corte:** la primera posición ≥ 3 donde la pérdida llega al 10 %, siempre que ninguna posición posterior vuelva a quedar por debajo de ese 10 %.
- **Segundo corte:** la primera posición posterior en la que todas las que siguen son al menos 15 puntos peores que todas las que quedan entre los dos cortes.
- **Repetición:** cada corte tiene que verse por separado en la primera y en la segunda mitad de las sesiones, ordenadas por fecha. Si no, el estado es `no_cut`.
- **Valor publicado de cada corte:** la pérdida de su tramo, calculada con los datos juntos.

## Por ejercicio
- **Posición habitual:** la moda de sus posiciones. Las sesiones en las que estuvo en otra posición se marcan como `moved`.
- **`compare`:** solo existe si el ejercicio se hizo en al menos dos posiciones. Se calcula con el peso que más usó como el más pesado de la sesión: la mediana de las mejores reps a ese peso, posición por posición. `pct` compara la última posición con la primera. Es la única lectura que separa el orden del ejercicio.
