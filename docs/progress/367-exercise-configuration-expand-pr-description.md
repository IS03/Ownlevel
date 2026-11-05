# #367 EXPAND — Configuración del ejercicio por sesión (#394)

**Base: `main`.** No necesita código de otro PR pendiente. **Sin aplicar en producción.**

El ADOPT es #395: aplicar esta migración antes de mergearlo.

- Reglas y modelo: [367-exercise-configuration.md](367-exercise-configuration.md).
- Rollout: [367-exercise-configuration-rollout.md](367-exercise-configuration-rollout.md).

## Qué agrega

`supabase/migrations/20261106120000_training_exercise_configuration_expand.sql`, blob `85aaeb254c68bafe2a9834e9d118f415f3075648`.

**Tabla `workout_session_exercise_configurations`.** Una fila por ejercicio de sesión, con su propia revisión.
- **Sin backfill:** todo el historial queda desconocido.
- **`recorded_phase`:** la pone el servidor según el estado de la sesión al escribir.
  - `during_session`: con la sesión en curso.
  - `after_session`: con la sesión completada.
  - El cliente no la envía y, si la manda, la escritura se rechaza.

**RLS:**
- el dueño lee sus filas;
- nadie escribe directo;
- `anon` no lee.

**Funciones:**
- **`read_training_exercise_configurations_v1(session)`**, invoker. Devuelve:
  - la configuración de cada ejercicio de la sesión;
  - la última conocida del mismo ejercicio, si hay una sola en la última sesión completada antes de esta.
- **`mutate_training_exercise_configuration_v1(session, input)`**, definer:
  - pasa por el bloqueo por usuario, el ledger de idempotencia y el CAS por revisión;
  - comprueba la procedencia de «Igual que la última vez».
- **`insights_source_changed()`**: la de #391 con una rama más. La tabla cuenta como una serie, a través de su ejercicio de sesión.

**Clientes instalados:** no cambia ninguna función, columna ni respuesta existente. Nada lo lee hasta el ADOPT.

## Validación

### PostgreSQL 17.6 con PostgREST y Auth

Pila local de Supabase descartable, `ownlevel-receipt-81c940df`:
- **Versión:** `PostgreSQL 17.6 on x86_64`, imagen `supabase/postgres:17.6.1.105`, PostgREST v16.5 y Auth.
- **Esquema:** se aplicaron las 90 migraciones de `main` anteriores a #391 en una base nueva, sin datos del usuario ni URLs remotas.

**Suite de revisión de #391** (`insights-source-revision.local.test.ts`):
- **Cambio en la suite.** Antes aplicaba solo #391. Ahora aplica también cada migración posterior, así que prueba la función de trigger vigente.
- **Pruebas que se repitieron: 8 de 43, las afectadas, todas pasan.**
  - Cobertura de una sesión completada y lo que cuelga de ella, con la configuración agregada.
  - Lo que Insights no lee, con la configuración de una sesión en curso, que no mueve el contador.
  - Sesión completada mientras otra transacción escribía una serie.
  - **Nueva:** lo mismo con una configuración.
  - Los dos casos de «no deadlock».
  - Escritores concurrentes bajo una sesión completada.
  - Funciones de finish y descarte.

**Suite de cruce** (`insights-token-crossing.local.test.ts`): **3 guardas, sin cambios en sus expectativas, todas pasan.** La de los triggers diferidos sigue fijando las mismas tres funciones: el trigger nuevo usa `insights_source_changed`.

**Después del ajuste de fase:** se revirtieron #391 y la configuración con sus propios bloques de reversión, en la base descartable. Volvieron a pasar las 8 pruebas, las 3 guardas y las 5 de configuración con PostgREST del ADOPT.

### PostgreSQL 18.6 embebido

`scripts/testing/exercise-configuration-postgres.mjs`: **78 aserciones.**
- validación;
- CAS y replay;
- carrera de dos conexiones;
- catálogo cambiado;
- «Como la última vez»;
- fase `after_session`;
- descarte;
- contador.

**Es complementario: no reemplaza la verificación en 17.6.**

```bash
OWNLEVEL_TEST_MODULES=<tooling>/node_modules node scripts/testing/exercise-configuration-postgres.mjs
```

## Límites

- **No corrí la suite de revisión completa (43) ni la de cruce completa (29), ni la campaña estadística.** Solo las afectadas.
- **Cada escritura sobre una sesión completada toma el bloqueo por cuenta de #391 al confirmar.** Son pocas y manuales. No lo medí con carga.
