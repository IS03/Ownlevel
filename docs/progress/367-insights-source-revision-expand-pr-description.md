## Resumen
EXPAND de una revisión transaccional de las fuentes de Insights: un contador por cuenta que la base mueve en la misma transacción que los datos. **Base: `main`.** Independiente de los demás PR de #367. **Sin aplicar en producción, y ningún código lo lee todavía.**

## Por qué
`count + max(updated_at)` no identifica todos los cambios. `updated_at` es la hora en que empezó la transacción, así que una que empezó antes y confirma después de otra más nueva cambia una fila sin mover ninguno de los dos valores. Reproducido con dos transacciones reales. Agrupar esas consultas en una RPC no lo arregla, y una secuencia tampoco: sus valores se entregan antes de confirmar.

## Cambios
- Tabla `insights_source_revisions`: una fila por cuenta, solo lectura de la propia con RLS. Sin fila se lee como 0. Sin backfill: no hace falta.
- Trigger diferido en sesiones, ejercicios, series, sensaciones, definiciones y valores de métricas, comidas, y la fecha lógica del día.
- Se mueve una vez por transacción, al confirmar: el bloqueo llega último y dura solo el commit.
- Una sesión en curso no lo mueve. Su escritura revisa la sesión con un bloqueo compartido, y por eso una sesión completada mientras otra transacción escribía bajo ella sí cuenta.

## Validación
14 pruebas contra Postgres y PostgREST en una pila local descartable, con las 89 migraciones previas (eliminada después: 0 contenedores, 0 volúmenes):
- **Colisión:** una transacción más vieja que confirma después mueve el contador, y una consulta comprueba que cantidad y máximo no cambian.
- **Atomicidad:** no se mueve antes del commit, ni en un rollback.
- **Cobertura:** cada fuente y dependencia, por SQL y con token.
- **Convivencia:**
  - 12 escritores concurrentes de una cuenta terminan y se cuentan todos.
  - Una reejecución de idempotencia no lo mueve.
  - `mobile_delete_account` sigue funcionando con datos.
- **Permisos:** otra cuenta no lo lee; un token no lo escribe ni llama a sus funciones.
- `mobile_meal_timing.sql`, `pr7_1` y `pr8` pasan.

**Costo de escritura:** sin diferencia detectable, pero la medición es débil: 30 series y 366 comidas, con el arranque de `psql` dominando los ~190–240 ms.

## Límites
- **Serializa el commit de las escrituras de una misma cuenta.** Son breves, pero no lo medí con carga real.
- `TRUNCATE` y `session_replication_role = replica` no disparan triggers. Ningún camino del producto los usa.
- Las series y los ejercicios agregan una consulta por fila dentro del commit, con un bloqueo compartido sobre su sesión. Falta OBSERVE.

## Siguiente
ADOPT en un PR apilado sobre #386. Aplicar esta migración antes de mergearlo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
