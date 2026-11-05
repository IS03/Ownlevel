# #367 EXPAND — Configuración del ejercicio por sesión

**Base: `main`.** No necesita código de otro PR pendiente. **Sin aplicar en producción.** El ADOPT está en `codex/367-exercise-configuration-adopt`: aplicar esta migración antes de mergearlo.

Reglas y modelo: [367-exercise-configuration.md](367-exercise-configuration.md).

## Qué agrega

`supabase/migrations/20261106120000_training_exercise_configuration_expand.sql`:

- **Tabla `workout_session_exercise_configurations`**, una fila por ejercicio de sesión, con su propia revisión. Sin backfill: todo el historial queda desconocido.
- **RLS:**
  - el dueño puede leer sus filas;
  - nadie escribe directo;
  - `anon` no lee.
- **`read_training_exercise_configurations_v1(session)`** (invoker) devuelve:
  - la configuración de cada ejercicio de la sesión;
  - la última configuración conocida del mismo ejercicio, si hay una sola en la última sesión completada antes de esta.
- **`mutate_training_exercise_configuration_v1(session, input)`** (definer) pasa por el bloqueo por usuario, el ledger de idempotencia y el CAS por revisión. Comprueba la procedencia de «Igual que la última vez».
- **`insights_source_changed()`** es la misma función de #391 con una rama más: la tabla cuenta como una serie, a través de su ejercicio de sesión. La prueba compara su texto con el de #391 menos esa rama.

**Clientes instalados:** no cambia ninguna función, columna ni respuesta existente. Nada lo lee hasta el ADOPT.

## Validación

PostgreSQL real y descartable (embedded-postgres, sin red ni datos de producción): `scripts/testing/exercise-configuration-postgres.mjs`, **77 aserciones**.

| Área | Cubierto |
| --- | --- |
| Estado inicial | Todo desconocido; sin filas |
| Permisos | Escritura solo por RPC; RLS entre usuarios; `anon` y sin sesión rechazados |
| Validación | Forma, etiqueta (vacía, larga, control), tipo, procedencia, claves extra |
| Escritura | Etiqueta normalizada; replay exacto ante respuesta perdida; clave reutilizada con otro cuerpo; CAS; mismo valor sin revisión nueva; borrado explícito |
| Concurrencia | Dos conexiones sobre una misma revisión: una escribe, otra recibe `CONFIGURATION_CHANGED` |
| Autosave | `updated_at` del ejercicio (CAS de series) no se mueve |
| Catálogo | Cambiar implemento, modo o notas del ejercicio no toca lo registrado |
| «Igual que la última» | Orden temporal; ambigüedad con dos valores; mayúsculas; etiqueta, sesión posterior, otro ejercicio, la misma sesión y otro usuario rechazados |
| Revisión de Insights | No se mueve con la sesión en curso; se mueve al completarla, con cada escritura sobre una completada y al borrar en cascada |
| Descarte | Conserva las filas y rechaza escrituras nuevas |

```bash
OWNLEVEL_TEST_MODULES=<tooling>/node_modules node scripts/testing/exercise-configuration-postgres.mjs
```

## Límites

- **Corrió en PostgreSQL 18.6 embebido.** No corrió sobre 17.6.1.105, la versión de producción, ni sobre la pila de Supabase con PostgREST.
- **No se repitieron las suites de revisión (42) ni de cruce (29) de #391.** La rama nueva usa el mismo camino que las series (`exercise`). Sí se comprobó que el resto de la función es idéntico.
- **Cada escritura sobre una sesión completada toma el bloqueo por cuenta de #391 al confirmar.** Son pocas y las hace la persona a mano. No lo medí con carga.

## Rollout

1. Aplicar esta migración.
2. Mergear este PR.
3. Mergear el ADOPT. Sin la migración, Insights responde 503: el loader lee la tabla.
