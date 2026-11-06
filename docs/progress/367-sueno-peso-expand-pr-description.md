# #367 EXPAND — Noche del sueño y peso corporal como fuente

**Base: `main`.** No necesita código de otro PR pendiente. **Aplicada en producción el 5 de noviembre de 2026 (Córdoba), versión efectiva `20261106024523`, con el mismo blob SQL.** El ADOPT está en `codex/367-sleep-weight-adopt`.

- Semántica y método: [367-sueno-peso.md](367-sueno-peso.md).
- Rollout: [367-sueno-peso-rollout.md](367-sueno-peso-rollout.md).

## Qué agrega

`supabase/migrations/20261106024523_sleep_night_and_body_weight_sources_expand.sql`, blob `39644f101e44ac25b303278392523cb4456e928d`.

**Tabla `daily_metric_value_conventions`:**
- guarda la declaración de qué noche es un valor de sueño, atada a su `updated_at`, valor y fecha;
- RLS: el dueño lee y nadie escribe directo;
- sin backfill.

**Funciones:**
| Función | Qué hace |
| --- | --- |
| `declare_sleep_night_v1(fecha, métrica, updated_at)` | Confirmación explícita, con CAS sobre `updated_at` |
| `declare_sleep_nights_written` | Declara solo lo que escribió la transacción en curso |
| `save_daily_metric_values_v2` (Web) | Envuelve a la v1 de Web y declara en la misma transacción |
| `mobile_mutate_nutrition_day_v2` (Mobile) | Envuelve a la v1 de Mobile y declara en la misma transacción; un replay no declara nada nuevo |

**Contador de #391:**
- la tabla nueva entra por el camino `direct`;
- `day_logs` suma tres triggers, que se disparan cuando el peso aparece, cambia o se borra;
- la función compartida no cambia.

**Clientes instalados:** no cambia ninguna función, columna ni respuesta existente.

## Validación en PostgreSQL 17.6.1.105, PostgREST y Auth

Pila local descartable `ownlevel-receipt-130a93f1`, con las 92 migraciones de `main` aplicadas en una base nueva.

**Suite de revisión de #391: 9 de 45 pruebas, las afectadas, todas pasan.**
- **Nueva:** peso que aparece, cambia o se borra mueve el contador; sin peso, mismo peso o totales no lo mueven.
- **Nueva:** declaraciones, una vez por transacción.
- Métricas.
- Sesión completada y fecha del día.
- Lo que Insights no lee.
- Una vez por transacción.
- Los dos casos de «no deadlock».
- Escritores concurrentes de una cuenta.

**Guardas de cruce: 3, sin cambios en sus expectativas.** La de los triggers diferidos sigue fijando las mismas tres funciones.

**Prueba de punta a punta del ADOPT: 4 pruebas** en esta misma pila (detalle en su descripción).

**Corrección encontrada en 17.6 con PostgREST:** un identificador ambiguo (`42702`) en los envoltorios. Corregido; las 4 pruebas de punta a punta volvieron a pasar.

## Límites

- **La suite de #391 corrió antes de la corrección del identificador ambiguo.** Esa corrección está en los envoltorios, que la suite no ejercita; los triggers no cambiaron.
- **Declarar con la escritura toma el bloqueo por cuenta de #391 al confirmar,** como cualquier valor de métrica. No lo medí con carga.


## Corrección de revisión
Se completó la cabecera de reversión con `drop function public.declare_sleep_nights_written(date, uuid[]);`, después de quitar los envoltorios y antes de quitar `declare_sleep_night_v1`. Solo cambió un comentario SQL y las referencias al blob. El SQL ejecutable es idéntico; la validación local publicada se conserva sin repetir campañas.
