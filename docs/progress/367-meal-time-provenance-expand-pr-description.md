## Resumen
EXPAND de la procedencia de la hora de comida: `meal_entries.consumed_at_source` registra quién fijó la hora al escribirla. Reglas, productores y orden de rollout: [procedencia](367-meal-time-provenance.md).

**Base: `main`.** Independiente de #380, #383 y #385. **Sin aplicar en producción.**

## Cambios
- Migración aditiva: columna nullable, sin valor por defecto y **sin backfill**.
- `mobile_mutate_manual_meal` y el registro rápido aceptan `consumedAtSource: "user_declared"`.
- ChatGPT v2 y v3 registran `default_clock` y `registration_now`. v4 nuevo registra una hora declarada, con `time_stated_by_user`.

## Reglas clave
- Que llegue `consumedAt` no prueba nada: sin declaración queda `null`.
- Omitir la hora, reenviar el mismo valor o mover de día con el mismo reloj conserva la procedencia. Otra hora sin declaración la borra.
- Una declaración se registra aunque el valor sea igual.
- Los clientes instalados no cambian de payload ni de hash de idempotencia.

- Un trigger cierra la escritura directa con un token: una sesión no puede declarar, y cambiar la hora directamente borra la procedencia.

## Validación
38 pruebas contra Postgres y PostgREST en una pila local descartable, con usuarios reales, RLS y las 89 migraciones previas (eliminada después: 0 contenedores, 0 volúmenes). La prueba escribe como cliente instalado, aplica la migración y revisa esas filas: claves antiguas, ausencia de retroactividad, dueño, OAuth y atomicidad. 8 pruebas de contratos. `mobile_meal_timing.sql` confirma el hash de un pago antiguo.

**Fallos comprobados en la base (`b5e57e3`), no causados por este PR:**
- 3 pruebas Web: `nutrition-import.test.ts` (1) y `pr73.test.ts` (2).
- `supabase/tests/ownlevel_oauth_meals.sql` falla igual con y sin esta migración, en `ownlevel_oauth_grant_meals`. No investigué la causa. El camino de OAuth v4 sí está probado en la prueba local.

**Sin validar:** el `ALTER TABLE` con datos de producción y el flujo con un GPT real.

## Siguiente
ADOPT en un PR apilado. Aplicar esta migración antes de mergearlo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
