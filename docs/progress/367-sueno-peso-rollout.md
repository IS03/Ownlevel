# #367 — Paquete de rollout: noche del sueño y peso corporal

**Sin autorizar.** Este paquete no aplica nada.

## Migración

| Archivo | Blob |
| --- | --- |
| `supabase/migrations/20261107120000_sleep_night_and_body_weight_sources_expand.sql` | `c1470c85d825908d8a490b30f13e498109ffd96c` |

```bash
git rev-parse origin/codex/367-sleep-weight-expand:supabase/migrations/20261107120000_sleep_night_and_body_weight_sources_expand.sql
```

**Si Supabase asigna otra versión al aplicar:** renombrar el archivo en Git para que coincida y conservar el blob, como con #387, #391 y #394. No tocar el historial remoto.

## Orden

1. Aplicar la migración del EXPAND.
2. Mergear el EXPAND.
3. Mergear el ADOPT. Contiene los commits del EXPAND.

**Sin la migración, el ADOPT falla así:**
- el loader de Insights embebe la tabla nueva, así que responde 503;
- el guardado de sueño en Web y en Mobile llama a los envoltorios, así que da error al guardar.

Antes de mergear, sacar de borrador. Si `main` cambia, volver a comprobar mergeabilidad y blob.

## Comprobaciones después de aplicar, sin escribir datos

**Tabla `daily_metric_value_conventions`:**
- existe y está vacía;
- RLS habilitada, con una política `select`;
- `authenticated` sin `insert`, `update` ni `delete`;
- `anon` sin acceso.

**Funciones:**
- `declare_sleep_night_v1`, `declare_sleep_nights_written`, `save_daily_metric_values_v2` y `mobile_mutate_nutrition_day_v2` tienen `EXECUTE` para `authenticated`, no para `anon` ni `public`;
- `declare_sleep_night_v1` es definer; las demás, invoker.

**Triggers:**
- en `day_logs`: `insights_source_changed`, `insights_source_weight_inserted`, `insights_source_weight_changed` e `insights_source_weight_deleted`, diferidos e inicialmente diferidos;
- uno más sobre la tabla nueva.

**Contador:** 0 notas auxiliares y 0 advisory locks esperando.

**Advisors:**
- Se espera una advertencia más de `SECURITY DEFINER` ejecutable por `authenticated`, por `declare_sleep_night_v1`: intencional, con dueño y CAS.
- Probablemente aparezca un índice sin uso, el de `user_id` de una tabla vacía.
- Cualquier otro aviso nuevo hay que revisarlo.

**Después del deploy del ADOPT:**
- `GET /api/mobile/v1/progress/performance-insights?method=2` sin identidad responde 401;
- sin `method` sigue respondiendo el método 1.

## Reversión

Está en la cabecera de la migración. **Primero va el código** que ya no llama a los envoltorios ni lee la tabla, y recién después:
1. los cuatro triggers;
2. las cuatro funciones;
3. la tabla.

## Límites y OBSERVE

- **Se validó en una pila local sin carga.**
- **Para observar:**
  - errores de los envoltorios;
  - 503 de Insights;
  - cuántos valores de sueño quedan declarados frente a desactualizados.
- **Sin build:** la captura Mobile llega al teléfono con una build autorizada, y Web con el deploy.
