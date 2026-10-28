# Incidente #334: conflicto permanente reintentado por PostgREST

Investigación del 28/10/2026, baseline `main` `4feb74a`. [Issue #334](https://github.com/IS03/Ownlevel/issues/334).
Producción se consultó sólo en lectura: logs, catálogos y estadísticas. No se ejecutaron RPCs de escritura,
migraciones, reinicios, cambios RLS, pruebas de carga ni cambios de recursos en producción.

## Causa demostrada y límites de atribución

`ownlevel_private.reorder_training_routines` rechaza una lista/version obsoleta mediante SQLSTATE `40001`.
Ese código significa `serialization_failure`, por lo que **PostgREST 14.5 / hasql-transaction repite
la transacción internamente sin límite**. Los mismos parámetros CAS siguen siendo inválidos;
una sola petición puede generar miles de transacciones revertidas sin nuevas peticiones del cliente.
Se verificó por lectura que la función instalada conserva ese `RAISE` y que la sesión activa usa 14.5.

La repetición no requiere un retry en React Native, Web o Vercel. El defecto de la capa PostgREST está
[documentado por upstream](https://github.com/PostgREST/postgrest/issues/3673) y
[corregido por upstream](https://github.com/PostgREST/postgrest/pull/4222). La versión 14.5 usa
`SQL.transaction`/`SQL.unpreparedTransaction` con `hasql-transaction < 1.2` (fuentes del tag v14.5,
`src/PostgREST/MainTx.hs` y `postgrest.cabal`). No se actualizó el servicio para diagnosticar.

**No se identificó el dispositivo, usuario ni petición HTTP inicial.** Reutilizar una sesión PostgREST
no identifica un dispositivo. La explicación de la amplificación sí está reproducida; la atribución
individual del tráfico histórico y de cada rollback sigue limitada por la observabilidad disponible.

## Evidencia de producción (UTC)

| Medición independiente | Resultado |
| --- | --- |
| Logs PostgreSQL, 16:30–17:00 (evidencia del issue) | 1.788 errores `ROUTINE_LIST_CHANGED` / `40001` |
| Consulta nueva, 20:40–21:10 | 1.787 eventos PostgreSQL `40001`, aplicación PostgREST 14.5 |
| Ventana 21:00–21:10 | 600 eventos entregados, una sesión DB, una forma de consulta; `session_line_num` 977.702.300 → 978.132.430 |
| Actividad puntual, 21:14:01 | Un backend PostgREST ejecutando la RPC de reorder; también se observó `idle in transaction (aborted)` en otra muestra |
| Contadores, 21:13:39.177585 | `xact_rollback = 1.023.904.623` |
| Contadores, 21:18:03.847261 | `xact_rollback = 1.024.093.798` |
| Delta en 264,669676 s | **189.175 rollbacks; 714,76/s** |
| Durante esas muestras | `blks_read = 3.082` sin cambio, deadlocks/conflicts = 0; son muestras, no certificación de ausencia histórica de I/O |

Las ~430.130 líneas entre extremos de diez minutos no equivalen a 600 errores reales: faltan líneas
en el stream entregado. No se demostró el mecanismo exacto de descarte/limitación, ni se interpreta
una línea como una transacción. La tasa de rollback se midió por separado con deltas, no inferida
multiplicando el contador de logs por tiempo.

`pg_stat_statements` (tracking `top`) muestra ~989 millones de llamadas de configuración transaccional
y ~982 millones al pre-request `ownlevel_restrict_oauth_data_api`, ejecutados como `authenticated`.
Dos muestras de esas formas crecieron ~16.570 veces en ~23 s, coherentes con la tasa de rollbacks.
Son contadores históricos; las consultas fallidas no aportan un conteo completo del RPC en esa vista.
No se atribuye todo el consumo de CPU, memoria o Disk I/O exclusivamente a este incidente.

La repetición interna explica la gran diferencia entre eventos entregados y rollbacks y es consistente
con la actividad observada. La contribución exacta a la tasa de producción debe comprobarse después
de un despliegue aprobado; no hay medición de producción posterior a la corrección.

## Revisión de emisores y reintentos

- Mobile: `RoutinesScreen.saveOrder` se invoca al confirmar, tiene `pendingRef` y abandona el borrador
  tras conflicto/error; refresca la lectura, no vuelve a guardar con el mismo CAS.
- Cliente Mobile: `request` no reintenta escrituras tras conflicto, timeout ni 401. La revalidación de
  auth puede repetir sólo GET con un token renovado. Las pruebas focalizadas existentes lo cubren.
- Mobile API: la ruta de orden usa `authenticateMobileMutationAccessToken` con
  `retryMutations: false`; `training-server` ejecuta una RPC. `resilient-fetch` no repite este POST.
- Supabase JS instalado: retries automáticos limitados a métodos idempotentes. La RPC usa POST.
  [Documentación oficial](https://supabase.com/changelog/45071-automatic-postgrest-retries-for-transient-errors).
- Web/PWA y Capacitor legado: la búsqueda de referencias al endpoint/RPC de orden no encontró otro
  emisor en esos clientes. Las lecturas Web ordenan por `routine_order`; el SW no configura una cola
  de escrituras ni Background Sync. Esto no excluye clientes externos o versiones históricas.
- Scripts: `m9-routine-library.mjs` usa exclusivamente PostgreSQL efímero en loopback, sin URL remota.
  No se encontró otro llamador de esa RPC en los scripts versionados.
- Procesos locales inspeccionados: los dos procesos Expo identificados pertenecían a carpetas Mobile;
  no se encontró un runner de reorder activo. No hay crontab del usuario ni directorio de automatizaciones
  Codex en `~/.codex/automations`. No existe `cron.job` en este proyecto DB. No se detuvo ningún proceso.
  Este inventario actual no reconstruye procesos pasados, otros equipos ni automatizaciones externas.

Codebase Memory se usó para descubrir/trazar el llamador Mobile, con comprobación de cobertura. Su
índice corresponde a un checkout anterior; se verificaron las fuentes relevantes actuales. Scripts y
migraciones, excluidos del índice, se leyeron directamente. No se regeneró el índice.

## Límites de logs

- La consulta histórica Vercel 16:30–17:00 devolvió **error de retención del plan Hobby**, no cero requests.
  La consulta de los últimos 30 minutos no devolvió grupos de runtime logs. Los runtime logs no son
  un censo de todas las peticiones HTTP y un request id no puede reconstruirse a partir de la sesión DB.
- En 20:40–21:10, el stream de Supabase consultado sólo devolvió eventos PostgreSQL: no había eventos
  gateway correlacionables, ni siquiera para otras rutas. La ausencia de reorder allí no identifica origen.
- [Supabase Status](https://status.supabase.com/) informó «Delayed Log Delivery from 14:10 - 15:30 UTC»
  el 28/10, resuelto a las 17:13:56 UTC. No se atribuyen sin evidencia todos los huecos posteriores a ese incidente.
- No se leyeron/publicaron tokens, cabeceras de autorización, payloads, nombres ni datos personales.

## Corrección preparada

`20261028211830_routine_order_conflict_no_retry.sql` reemplaza exclusivamente el código de excepción
`40001` por `PT409` en el CAS de reorder. Mantiene firma, cuerpo restante, identidad, permisos, locks,
validación de IDs/versiones, rechazo de conflictos y ledger de idempotencia. No cambia otras RPCs.
El backend acepta ambos códigos durante el rollout y conserva el mismo contrato Mobile:
HTTP 409 con `error: ROUTINE_LIST_CHANGED`. Se conserva `40001` legacy para despliegues mixtos.

Otros conflictos de negocio que aún usan `40001` quedan fuera de este cambio; no se observó que
estuvieran generando la anomalía actual. No se afirma que la corrección de reorder elimine todo error
posible de serialización o toda transacción revertida legítima.

## Reproducción y validación local

PostgreSQL 17 efímero + binario oficial PostgREST **14.5**, ambos en loopback, con datos sintéticos.
Una petición, sin bucle de HTTP ni retry del cliente:

| Variante | Resultado |
| --- | --- |
| SQL original `40001` | Timeout del cliente a 702 ms, 3.232 rollbacks visibles mientras seguía vivo; continuó después del abort. Delta al cerrar el proceso local: 4.536 |
| SQL corregido `PT409` | HTTP 409 en 6–12 ms en ejecuciones locales, **1 rollback**, lista/version intactas; un guardado válido y su replay también funcionan |

No son tiempos ni benchmarks de producción. El delta original se tomó después de terminar el proceso
local y puede incluir su cierre; no se usa como un número exacto de errores RPC. La mejora verificable
es terminar la petición y evitar el bucle no acotado. En una segunda reproducción del baseline,
`pg_stat_activity` confirmó una ejecución nueva de la RPC (`query_start`) posterior al timeout del
cliente, demostrando que la cancelación HTTP no había detenido el retry interno.

La regresión HTTP es opcional en el runner existente; requiere un binario PostgREST local:

```sh
OWNLEVEL_TEST_MODULES=/ruta/tooling/node_modules \
OWNLEVEL_POSTGREST_BIN=/ruta/postgrest \
node scripts/testing/m9-routine-library.mjs
```

El runner crea PostgreSQL local y destruye sólo sus procesos/archivos. El helper ignora `PGRST_*`
heredadas para impedir que una variable de entorno sobreescriba la URI de loopback. En macOS puede
ser necesario configurar `DYLD_LIBRARY_PATH` con las bibliotecas del binario local.

Validaciones ejecutadas:

- Prueba backend nueva: con el mapper anterior devuelve 503 en vez de 409; falla antes y pasa después.
- Vitest: `training-routine-library`, `training-server`, `resilient-fetch`: **3 suites / 80 pruebas OK**.
- Jest Mobile: `routines-screen`, `routine-library`, `client`: **3 suites / 68 pruebas OK**.
- Runner PostgreSQL: migración real aplicada dos veces, comparación del cuerpo (sólo cambia el código),
  ownership/permisos, validación, conflictos, replay, preservación histórica y carreras entre conexiones.
- HTTP real: conflicto acotado, contador de rollback, snapshot intacto, guardado válido y replay.
- Root `tsc --noEmit`, ESLint de los archivos JS/TS modificados y `git diff --check`: OK.
- No se ejecutó toda la suite raíz ni Mobile; no se afirma validación global.

## Despliegue y verificación posterior (requieren aprobación; NO ejecutados)

1. Revisar/fusionar la PR y desplegar primero el backend que reconoce **PT409 y 40001**. Verificar el
   commit desplegado; no cambiar aún la semántica SQL ante un backend que sólo reconoce el código viejo.
2. Con autorización explícita para producción, aplicar **sólo** la migración indicada por el flujo de
   migraciones habitual. No volver a ejecutar las migraciones antiguas. No es un cambio destructivo.
3. Verificar mediante `pg_get_functiondef` que sólo el `RAISE` esperado cambió. Observar si la petición
   pendiente retorna al usar la nueva definición; no prometer que editar el código backend por sí solo
   libera un retry ya ejecutándose dentro del servicio. No reiniciar/terminar sesiones automáticamente.
4. Comparar ventanas equivalentes de 5–10 minutos, usando deltas de `pg_stat_database.xact_rollback`
   y verificando reinicios/resets. Comparar también crecimiento de pre-request/configuración,
   actividad del backend y logs `ROUTINE_LIST_CHANGED`. No confundir menos logs con menos errores reales.
5. Contrastar CPU/Disk I/O/memoria del dashboard con el tráfico normal del mismo período; las lecturas
   puntuales no certifican recuperación de esos recursos. Observar HTTP 409 de una intención real obsoleta
   sin repetir manualmente escrituras contra producción para generar carga.
6. Si la tasa permanece elevada, mantener #334 abierto y separar los rollbacks restantes por actividad
   y ventana. Escalar la evidencia del retry a soporte Supabase para revisar el servicio 14.5, sin cambiar
   CAS, RLS ni recursos como workaround. No emitir un cierre del incidente antes de medir el resultado.
