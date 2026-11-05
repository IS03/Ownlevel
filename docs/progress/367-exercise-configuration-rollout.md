# #367 — Paquete de rollout: configuración del ejercicio

**Autorizado expresamente y migración aplicada el 2026-11-05.** Versión efectiva de Supabase: `20261105223915`. #393 y #394 ya están mergeados; esta entrega completa la adopción en #395. No volver a aplicar la migración. El SQL conserva el blob aprobado. El registro de cierre y despliegues está en [continuidad de producción](https://github.com/IS03/Ownlevel/blob/integration/367-insights-candidate/docs/progress/367-variantes-rollout-produccion-2026-11-05.md).

## Migración

| Archivo | PR | Blob |
| --- | --- | --- |
| `supabase/migrations/20261105223915_training_exercise_configuration_expand.sql` | #394 | `85aaeb254c68bafe2a9834e9d118f415f3075648` |

Antes de aplicar, comprobar que el archivo de la rama tenga ese blob:

```bash
git rev-parse origin/codex/367-exercise-configuration-expand:supabase/migrations/20261105223915_training_exercise_configuration_expand.sql
```

**Supabase puede asignar otra versión al aplicar,** como pasó con #387 y #391. En ese caso se renombra el archivo en Git para que coincida y se conserva el blob. No se toca el historial remoto.

## Orden

1. **#393 (ChatGPT):** independiente. Se puede mergear antes, después o sin las otras.
2. **Aplicar la migración de #394.**
3. **Mergear #394.**
4. **Mergear #395.** Contiene los commits de #394.

Si #395 entra sin la migración, Insights responde 503 (el loader embebe la tabla) y la variante no se puede leer ni escribir.

**Sacar de borrador antes de mergear.** Si `main` cambia, volver a comprobar mergeabilidad y blob.

## Comprobaciones después de aplicar, sin escribir datos

- **Objetos creados:** la tabla, las dos funciones `*_v1`, `training_configuration_label` y el trigger `insights_source_changed` sobre la tabla nueva.
- **Tabla:**
  - RLS habilitada;
  - una política `select`;
  - `authenticated` sin `insert`, `update` ni `delete`;
  - `anon` sin acceso.
- **Funciones:**
  - las dos `*_v1` con `EXECUTE` para `authenticated` y sin acceso para `anon` ni `public`;
  - `training_configuration_label` sin `EXECUTE` para nadie.
- **Sin backfill:** la tabla está vacía.
- **La función de trigger:** el texto de `insights_source_changed` es el de #391 más la rama de la tabla nueva.
- **Advisors:**
  - Se espera una advertencia más de `SECURITY DEFINER` accesible para usuarios autenticados, por la función de escritura.
  - No se espera ningún informativo de RLS sin políticas: la tabla tiene una.
  - Cualquier otra advertencia nueva hay que revisarla antes de mergear.
- **Después del deploy de #395:** un GET sin identidad a `/api/mobile/v1/training/sessions/<id>/exercise-configurations` responde 401.

## Reversión

Está en la cabecera de la migración. **Primero va el código** que ya no lee la tabla, y recién después:
1. el trigger;
2. la función `insights_source_changed` de #391;
3. las funciones nuevas;
4. la tabla;
5. `training_configuration_label`.

## Límites

- **Se validó en 17.6.1.105 con PostgREST, en una pila local sin carga.** No predice producción.
- **Cada escritura sobre una sesión completada toma el bloqueo por cuenta de #391 al confirmar.** No se midió con carga real.
- **Sin build:** la captura Mobile llega al teléfono con una build autorizada. Web llega con el deploy de #395.
- **OBSERVE:** errores y esperas de la RPC nueva, 503 de Insights y cuántas variantes se registran durante la sesión frente a después.
