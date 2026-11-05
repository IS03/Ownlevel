## Resumen
ADOPT de la [revisión de las fuentes](367-insights-source-revision.md): el motor lee el contador transaccional y vuelve a reutilizar resultados, ahora con un criterio fiable.

**Base: #386.** **No mergear ni desplegar antes de aplicar la migración del EXPAND de la revisión ([#391](https://github.com/IS03/Ownlevel/pull/391), en `d20ff78`):** sin la tabla, el endpoint responde 503. Esa migración vive solo en #391: este PR no la copia ni la modifica.

## Cambios
- El control durante una lectura usa el contador, antes y después. Un cambio confirmado se detecta y se lee de nuevo.
- La reutilización vuelve: clave de cuenta (del token), contador y día de Córdoba, 3 entradas y 5 minutos.
- Quita las 14 consultas de revisión, incluida la de `workout_sets` con plan frágil.

## Costo
| | #386 | Este PR |
| --- | --- | --- |
| Lectura completa | `P + 14` | `P + 2` |
| Otra vista, si sigue en memoria | `P + 14` | **1** |
| PostgREST local a 5 años, lectura completa | 562–720 ms; 3,1–3,2 s sin estadísticas | 426–634 ms; 618–734 ms sin estadísticas |

**La reutilización es una optimización, no una garantía.** En otra instancia de Vercel se paga la lectura completa, y la tasa de aciertos real no se conoce. Siguen sin resolver a 10 años: el detalle de una relación (258 KiB), el pico de memoria (210 MiB) y la lectura en frío (268 consultas).

## Dos pasadas en #391
`d20ff78` cambia cómo se mueve el contador, no lo que este PR lee: sigue moviéndose en la misma transacción que los datos.

El trigger de cada fuente solo anota el cambio. Un segundo trigger diferido, que corre después de los rechecks de unicidad, toma el bloqueo y mueve el contador. Corrige un deadlock alcanzable con un solo token: un `PATCH` de 4001 filas y otro de 2 filas dieron 9 `40P01` en 15 rondas con `5672002`.

**No es una garantía general de ausencia de deadlocks.** Detalle, evidencia y límites: [la revisión de las fuentes](367-insights-source-revision.md#dos-pasadas) y [la descripción de #391](https://github.com/IS03/Ownlevel/blob/d20ff7885ed43237492baa76861b7f30720d3ba5/docs/progress/367-insights-source-revision-expand-pr-description.md).

## Validación
**Evidencia anterior, con `5672002` y este PR.** Con el esquema expandido en PostgREST local y dos transacciones reales:
- Un resultado en caché caliente se invalida cuando confirma una transacción más vieja, y la pantalla muestra el valor nuevo.
- Ese mismo cambio, durante una lectura, se detecta: dos intentos, y publica el valor confirmado.
- Una serie o un ejercicio que sale de una sesión completada, o una serie que entra en una, invalida el resultado caliente. **Antes de `5672002` la revisión quedaba idéntica.**
- Si uno retiene una sesión completada y otro confirma una métrica y una serie de ella, los dos terminan y cada uno invalida. **Antes de `5672002`, ese commit quedaba esperando** hasta el timeout de la prueba.

Pruebas del endpoint: costo con reintentos, medianoche, cuentas separadas, contador sin fila, tabla ausente y token inválido.

**Con dos pasadas, en la integración local y sin las revocaciones de `d20ff78`:** lectura, 6 pruebas y 1 omitida, e integración, 10 pruebas. Ahí el archivo de lectura incluye cambios de otros PR.

**Sobre la versión final, `d20ff78`, sin el código de este PR:** revisión, 42 pruebas; cruce, 29, con 3 rondas en las que no usan gancho; finish con recibo, 35 comprobaciones.

**Sin correr:** la suite de esta rama contra `d20ff78`. Este cambio solo toca documentación.

## Límites que siguen
Depende de `READ COMMITTED`. El orden entre vueltas es lo observado en PostgreSQL 17.11. Un trigger diferido futuro podría romperlo. Sin probar: carga real, réplicas de lectura y restauración a un punto en el tiempo. Falta OBSERVE.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
