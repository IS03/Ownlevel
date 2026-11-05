## Resumen
EXPAND de una revisión transaccional de las fuentes de Insights: un contador por cuenta que la base mueve en la misma transacción que los datos. **Base: `main`.** No necesita código de otro PR pendiente. **Orden de rollout, SHAs y comprobaciones:** [paquete de autorización](https://github.com/IS03/Ownlevel/blob/integration/367-insights-candidate/docs/progress/367-autorizacion-migraciones.md). **Sin aplicar en producción, y ningún código lo lee todavía.**

## Por qué
`count + max(updated_at)` no identifica todos los cambios. `updated_at` es la hora en que empezó la transacción, así que una que empezó antes y confirma después de otra más nueva cambia una fila sin mover ninguno de los dos valores. Reproducido con dos transacciones reales. Agrupar esas consultas en una RPC no lo arregla, y una secuencia tampoco: sus valores se entregan antes de confirmar.

## Cambios
- Tabla `insights_source_revisions`: una fila por cuenta, solo lectura de la propia con RLS. Sin fila se lee como 0. Sin backfill: no hace falta.
- Trigger diferido en sesiones, ejercicios, series, sensaciones, definiciones y valores de métricas, comidas, y la fecha lógica del día.
- Se mueve una vez por transacción y por cuenta, al confirmar.
- Una sesión en curso o descartada no lo mueve. Una fila movida entre sesiones cuenta por los dos lados.
- Tabla auxiliar `insights_source_pending` y un segundo trigger diferido: ver [Dos pasadas](#dos-pasadas).

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

## Dos pasadas
Nada espera a otra transacción con el bloqueo tomado. El trigger de cada fuente solo anota el cambio en `insights_source_pending`. Un segundo trigger diferido, sobre esa tabla, toma el bloqueo, lee el estado de la sesión y mueve el contador.

### El fallo que corrige
Tomar el bloqueo en la primera vuelta **tenía deadlock real, alcanzable con un solo token**. Cada request de PostgREST es `BEGIN`, una sentencia y `COMMIT`, leído del log del servidor. Con la versión anterior (`567200269112`):

| Operación con token | Clase | Resultado |
| --- | --- | --- |
| `PATCH` de `exercise_order`, otro token o sin token | Sin efecto | 200 sin filas: la RLS no las muestra |
| `POST`, `PATCH` y `DELETE` sobre `progress_views` | Rechazada por permisos | 403, `42501` |
| `mobile_reorder_progress_views` cruzada | Termina sin deadlock | El segundo espera al inicio y recibe `40001`. El contador no se mueve |
| `PATCH` de una fila a la misma posición | Termina sin deadlock | Un ganador, 409 con `23505`. El recheck va antes que el contador en la cola |
| `PATCH` de dos filas de sesiones distintas, con gancho | **Permitida, da `40P01`** | 500. Cada transacción queda entera o sin aplicar |
| El mismo `PATCH` frente a uno de 4001 filas, sin gancho, 100 ms después | **Permitida, da `40P01`** | **9 de 15 rondas** |

Ningún cliente hace ese `PATCH` directo: Web y Mobile usan funciones que bloquean la sesión primero. Pero el permiso existe, y quien lo use se afecta solo a sí mismo.

Ahora, en esos cruces, T1 confirma y T2 recibe 409 `23505`, sin aplicar nada, con el contador +1. En la campaña de la rama local de integración, el `PATCH` de 4001 filas dio 0 deadlocks en 75 rondas a 100 ms. Esa campaña no se repitió sobre este esquema.

### Por qué la segunda pasada corre después de los rechecks
Al confirmar, Postgres marca todos los eventos diferidos pendientes y los dispara. Lo que esos eventos encolan queda para la vuelta siguiente.
1. Los rechecks de unicidad se encolan al escribir, igual que el trigger que anota. Corren en la primera vuelta.
2. Anotar encola el segundo trigger, que recién corre en la vuelta siguiente.
3. Un recheck puede esperar a otra transacción, pero en ese momento esta todavía no tiene el bloqueo. No hay ciclo: la que llegó segunda espera y recibe `23505`.

Esto vale mientras nada de la primera vuelta encole otro recheck. Hoy lo único diferido son tres rechecks (`progress_views`, `routine_exercises`, `workout_session_exercises`) y estos dos triggers, y la primera vuelta solo escribe notas. Una prueba fija esa lista y falla si aparece otro.

`SET CONSTRAINTS` desde el trigger no sirve: en un commit todos los eventos ya están marcados, y no adelanta nada. Lo probé y el deadlock seguía.

### Permisos y aislamiento de la tabla auxiliar
- **Sin acceso:** se revocan tabla y secuencia a `public`, `anon`, `authenticated` y `service_role`, porque los privilegios por defecto de Supabase se los daban. Solo la tocan las dos funciones `security definer`.
- **RLS activa y sin políticas.** No está en ninguna publicación. Sigue accesible para su dueño (`postgres`) y, por su rol de solo lectura, para `supabase_read_only_user`, que no puede ver notas porque ninguna llega a confirmarse.
- **Comprobado por REST:** `GET`, `POST` y `DELETE` dan `42501` con token, sin token y con `service_role`.
- **Entre transacciones:** la clave única empieza por la transacción, así que anotar nunca espera a otra. Cada una ve solo sus notas, y desde afuera siempre hay 0.
- **Contenido:** ids de cuenta y de padre. Ningún valor del usuario.

### Limpieza
| Cómo termina | Nota | Contador | Escritura |
| --- | --- | --- | --- |
| Commit | Se borra por id en la segunda pasada, en la misma transacción | +1 | Confirmada |
| Rollback, o rollback a un savepoint | Muere con lo deshecho | Igual | Deshecha |
| Desconexión antes del commit | Muere con la transacción | Igual | Deshecha, sin dejar bloqueos |
| Desconexión en la segunda pasada, esperando el bloqueo | Muere con la transacción | Igual | Deshecha |

Las filas muertas quedan para autovacuum. Con 24.000 notas sin limpiar la tabla medía 3 MB (7,4 MB con índices), y en pocos minutos autovacuum la dejó en 8 kB. Es la configuración de la pila local; no lo medí en producción.

### Reinicio y concurrencia
Probado con una transacción abierta y su nota escrita:

| Evento | Notas | Archivo y secuencia | Contador y datos confirmados | Transacción abierta |
| --- | --- | --- | --- | --- |
| Parada limpia (`SIGINT`) | 0 | Conserva 8 kB y la secuencia sigue | Intactos | Deshecha |
| Caída (`SIGKILL`, con recuperación) | 0 | 0 bytes y la secuencia vuelve a 1 | Intactos | Deshecha |

No hay nada que reconstruir: una nota no significa nada fuera de su transacción. Después de cada evento la siguiente escritura movió el contador con normalidad. Tras la caída, la primera request de Auth de la pila falló una vez (`Database error checking email`) y la siguiente pasó; no investigué la causa.

Dos transacciones con la misma nota no se esperan al anotar, y cuentan las dos: +2. Se ordenan solo en el bloqueo de su cuenta.

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
Contra Postgres 17.11 y PostgREST en una pila local descartable, con las 89 migraciones previas (eliminada después). `insights-source-revision.local.test.ts` (42 pruebas) cubre:
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

`insights-token-crossing.local.test.ts` (29 pruebas) agrega el cruce con token, la tabla auxiliar y los otros constraints diferidos. Corre sobre el esquema con la migración ya aplicada.

**Las pruebas detectan el fallo:** con la migración de `567200269112` sobre este mismo esquema, las dos pruebas con gancho de `PATCH` de varias filas fallan con `40P01` y status 500. Con la versión final pasan.

**Sobre la versión final** pasan esas 42 y 29 (con 3 rondas en las pruebas sin gancho), y el recorrido de finish con recibo (35 comprobaciones). El log del servidor registra solo los 2 deadlocks de esa reproducción.

**No se repitió con las dos pasadas:** los scripts SQL de arriba y de abajo, que se corrieron con la versión anterior.

**Fallan igual con y sin esta migración**, comparado en la misma pila: `active_session_add_to_routine.sql` (`uniq_routines_user_nombre_norm`), `active_session_append_empty.sql` y `m3_3b_active_session.sql` (`not_authenticated`). No investigué la causa.

## Costo de escritura
Medido en una sola sesión de `psql`, con la versión anterior y la final alternadas: 3 tandas de 5 escrituras en una base sin carga.

| Escritura | Anterior | Con dos pasadas |
| --- | --- | --- |
| Una métrica, una nota | 2,5–10,9 ms | 2,5–10,6 ms |
| 1000 filas, una nota | 27–45 ms | 28–52 ms |
| 4000 filas de sesiones distintas, 4000 notas | 171–261 ms (mediana 203) | 245–301 ms (mediana 263) |
| WAL de esas 4000 filas | 3,10–3,14 MB | 3,13–3,16 MB |

- **Peor caso:** unos 60 ms más, un 30 %, unos 15 µs por nota. Es una escritura que ningún cliente hace.
- **Caso común:** las filas que comparten nota, como una métrica o las series de un ejercicio, dan una sola. Medido con métricas, la diferencia queda dentro del ruido, que entre tandas es mayor que entre versiones.
- **WAL:** cerca de 1 % más, porque las notas no lo generan.

**Límites de esta evidencia:**
- Es una pila local en Docker, sin carga ni escritores concurrentes. No predice producción: falta OBSERVE.
- Las pruebas sin gancho dependen del momento. Lo que fuerza el cruce en cada corrida son las pruebas con gancho, y el cierre se apoya en el orden de la cola, no en esas rondas.
- Ese orden es comportamiento del motor, comprobado en Postgres 17.11 y en 17.6.1.105, la versión de producción leída el 2026-11-05. En esa versión, la migración anterior también da `40P01` y las suites de revisión (42) y de cruce (29) pasan. No lo apoyo en una garantía del manual: una actualización mayor debería repetir estas pruebas.

## Reproducir
Pila local descartable, con la base en un contenedor `supabase_db_ownlevel-receipt-<8 hex>`; las pruebas rechazan cualquier otra. Sin el archivo de estado se omiten.

```bash
export OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=supabase_db_ownlevel-receipt-<8 hex>
```

Primero la suite que aplica la migración; necesita un esquema sin ella:

```bash
npx vitest run src/lib/mobile-api/insights-source-revision.local.test.ts
```

Después el cruce, sin la campaña:

```bash
OWNLEVEL_CROSSING_ROUNDS=3 OWNLEVEL_CROSSING_BIG_ROUNDS=3 npx vitest run src/lib/mobile-api/insights-token-crossing.local.test.ts
```

**Fixtures:** usuarios sintéticos por la API admin de Auth (de ahí `SERVICE_ROLE_KEY` en el archivo de estado) y filas propias de sesiones, métricas, rutinas y vistas. El gancho `test_hold` frena una request después de escribir y antes de confirmar, no escribe en el producto, y se elimina al terminar.

**Quedan fuera de este PR:** dos casos que necesitan el conjunto integrado (finish que suma a la rutina frente a una rutina retenida, y varias escrituras reales a la vez), en la rama local `integration/367-insights-local`.

**Para ver el fallo:** aplicar `git show 567200269112:supabase/migrations/20261104190000_insights_source_revision_expand.sql` y correr `-t "de varias filas \("`.

**Reinicio y caída:** son manuales, porque detienen la base. Con una transacción abierta, `docker kill --signal=INT <contenedor>` o `--signal=KILL`, y después `docker start <contenedor>`.

## Límites
- **Serializa el commit de las escrituras de una misma cuenta, también las de una sesión en curso.** Son breves, pero no lo medí con carga real.
- Depende de `READ COMMITTED`, que es lo que usa el producto. Una transacción `REPEATABLE READ` leería un estado viejo de la sesión.
- Una transacción que escriba en dos cuentas, en orden opuesto a otra, puede tener deadlock. Ningún camino del producto lo hace, y un token no puede.
- Cada cambio distinto agrega un insert y un delete dentro del commit, además de las consultas de la segunda vuelta.
- `SET CONSTRAINTS ALL IMMEDIATE` adelanta las dos pasadas y toma el bloqueo antes del commit. Ningún camino del producto lo hace y un token no puede: una request es una sola sentencia.
- Un trigger diferido nuevo que escriba en estas tablas podría encolar un recheck después del contador. La prueba de inventario falla si aparece.
- Sin probar: réplicas de lectura y restauración a un punto en el tiempo. La tabla auxiliar no se replica; el contador sí.
- `TRUNCATE` y `session_replication_role = replica` no disparan triggers. Ningún camino del producto los usa.
- Las series y los ejercicios agregan hasta dos consultas por cambio distinto dentro del commit. Falta OBSERVE.

## Siguiente
ADOPT en #392, con base `main`. Aplicar esta migración antes de mergearlo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
