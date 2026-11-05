## Resumen
EXPAND de una revisión transaccional de las fuentes de Insights: un contador por cuenta que la base mueve en la misma transacción que los datos. **Base: `main`.** Independiente de los demás PR de #367. **Sin aplicar en producción, y ningún código lo lee todavía.**

## Por qué
`count + max(updated_at)` no identifica todos los cambios. `updated_at` es la hora en que empezó la transacción, así que una que empezó antes y confirma después de otra más nueva cambia una fila sin mover ninguno de los dos valores. Reproducido con dos transacciones reales. Agrupar esas consultas en una RPC no lo arregla, y una secuencia tampoco: sus valores se entregan antes de confirmar.

## Cambios
- Tabla `insights_source_revisions`: una fila por cuenta, solo lectura de la propia con RLS. Sin fila se lee como 0. Sin backfill: no hace falta.
- Trigger diferido en sesiones, ejercicios, series, sensaciones, definiciones y valores de métricas, comidas, y la fecha lógica del día.
- Se mueve una vez por transacción y por cuenta, al confirmar.
- Una sesión en curso o descartada no lo mueve. Una fila movida entre sesiones cuenta por los dos lados.

## Orden de los bloqueos
Cada evento toma un solo bloqueo: uno de aviso (*advisory*) por cuenta, al confirmar. Después de obtenerlo lee el estado de la sesión, sin bloquearla. Así, un commit nunca espera una sesión ni una serie.

La versión anterior revisaba la sesión con `FOR SHARE`, y **tenía deadlock real**, reproducido con conexiones y barreras:

| | T1 | T2 | Sin corregir | Ahora |
| --- | --- | --- | --- | --- |
| Orden mixto | Retiene una sesión completada | Cambia una métrica y una serie de esa sesión, y confirma | `deadlock detected` | T2 confirma sin esperar, T1 después. Mueve 2 |
| Serie en disputa | Retiene la sesión y espera una serie | Tiene esa serie y confirma | `deadlock detected` | T2 confirma, T1 sigue. Mueve 2 |

La garantía que daba `FOR SHARE` se conserva, y se prueba forzando los dos órdenes:
- Si la sesión se completa primero, quien escribía la lee completada y mueve el contador.
- Si quien escribía llega primero, confirma antes, y quien ve el contador nuevo también ve esa escritura.

## Padre anterior y nuevo
La base **permite** estos movimientos, también con el token de su dueño: no hay ninguna guarda. La versión anterior consultaba solo el padre nuevo y **perdía el cambio**: sacar un ejercicio o una serie de una sesión completada no movía el contador.

| Movimiento (ejercicio, serie o sensaciones) | Mueve |
| --- | --- |
| Completada → en curso o descartada | 1 |
| En curso o descartada → completada | 1 |
| En curso ↔ descartada | 0 |

Además:
- Varios movimientos en una transacción cuentan una vez.
- Una cadena de movimientos conserva el origen.
- Un token no puede mover sensaciones, ni pasar una serie a otra cuenta.
- Por la base, pasar una serie a otra cuenta mueve los dos contadores.

## Validación
42 pruebas contra Postgres y PostgREST en una pila local descartable, con las 89 migraciones previas (eliminada después):
- **Colisión:** una transacción más vieja que confirma después mueve el contador, y una consulta comprueba que cantidad y máximo no cambian.
- **Atomicidad:** no se mueve antes del commit, ni en un rollback.
- **Cobertura:** cada fuente y dependencia, por SQL y con token.
- **Bloqueos:** los casos de arriba, con conexiones reales. Una cuenta que espera no frena a otra. El log del servidor no registra deadlocks en la corrida corregida.
- **Convivencia:**
  - Escritores concurrentes, de comidas y bajo una misma sesión completada, terminan y se cuentan todos.
  - Una reejecución de idempotencia no lo mueve.
  - `finish_workout_session` y `mobile_discard_completed_session` lo mueven una vez, y el recorrido real de finish con recibo sigue pasando.
  - Borrar una cuenta mientras se confirma una escritura suya termina bien en los dos lados.
- **Permisos:** otra cuenta no lo lee; un token no lo escribe ni llama a sus funciones.
- `mobile_meal_timing.sql`, `pr7_1`, `pr8`, `mobile_global_history` y `pr11_1` pasan. Esas pruebas no confirman, así que no disparan el trigger.

**Fallan igual con y sin esta migración**, comparado en la misma pila: `active_session_add_to_routine.sql` (`uniq_routines_user_nombre_norm`), `active_session_append_empty.sql` y `m3_3b_active_session.sql` (`not_authenticated`). No investigué la causa.

**Costo de escritura:** sin diferencia detectable, pero la medición es débil: 30 series y 366 comidas, con el arranque de `psql` dominando los ~190–240 ms.

## Límites
- **Serializa el commit de las escrituras de una misma cuenta, también las de una sesión en curso.** Son breves, pero no lo medí con carga real.
- Depende de `READ COMMITTED`, que es lo que usa el producto. Una transacción `REPEATABLE READ` leería un estado viejo de la sesión.
- Una transacción que escriba en dos cuentas, en orden opuesto a otra, puede tener deadlock. Ningún camino del producto lo hace, y un token no puede.
- Un constraint diferido que espere después de este bloqueo podría cerrar un ciclo. Los únicos diferidos existentes son el orden de ejercicios de rutina y de vistas de progreso. No los probé en esta combinación.
- `TRUNCATE` y `session_replication_role = replica` no disparan triggers. Ningún camino del producto los usa.
- Las series y los ejercicios agregan hasta dos consultas por fila dentro del commit. Falta OBSERVE.

## Siguiente
ADOPT en #392, apilado sobre #386. Aplicar esta migración antes de mergearlo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
