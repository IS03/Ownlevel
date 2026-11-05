# #367 — Integración local de Insights

Rama local `integration/367-insights-local`, sin publicar. Sirve para comprobar la combinación, no para mergearla: cada PR entra por su cuenta. El detalle de cada cambio está en la descripción de su PR.

## Commits integrados

Sobre `origin/main` en `b5e57e3d1a6fc19c439e81161fff20de1c00388a`, en este orden:

| PR | Commit | Merge local |
| --- | --- | --- |
| #387 | `b8f00770735bf05a00c18e2424771524a3babcbf` | `4eca363` |
| #388 | `f1d48ce0e0df6c511d76c94240d7e3371de54162` | `3ad90c6` |
| #383 | `d6332f3c832ee1526a7fe0892a113284b6340f5f` | `71f8da4` |
| #385 | `5e95a17ba07feaea48d967ca5b3f6d947a42a4d7` | `74085be` |
| #386 | `1deaef496f3a96586b407435a7150e2c1f004251` | `71ebe61` |
| #389 | `238b13144a8019e5745f1c3c14e04fa88f8882c1` | `dae3c81` |
| #390 | `6981f0d1569bd9200af7358a8bf1edcae6f05b92` | `eacf304` |
| #391 | `567200269112ca381037f79aa2f9a4172a3af973` | `dcfcf40` |
| #392 | `e39182377bbbdb23b6a95b9a170bb58474f5a1bd` | `79f6f06` |

#380 no se integró. Contra esta rama choca en `metrics-trends-screen.tsx`, `progress-screens.test.tsx` y `vercel.json`.

## Conflictos resueltos

- **`vercel.json`** (#385, #386, #391, #392): unión de los bloqueos. Quedan 11 ramas.
- **`performance-insights.local.test.ts`** (#392 contra #389): se conservan los imports de los dos. La cadena de comidas de #389 pasa a esperar la lectura de #392.
- **`performance-insights-server.ts`**: sin conflicto de texto. Queda la lectura por contador de #392, sin las 14 consultas de revisión.

Sin conflicto de texto, pero revisados: `post-workout-screen.tsx` (#383 y #390) y `apps/mobile/src/api/performance-insights.ts` (#389 y #390).

## Conteos de consultas

| Caso | Antes (#389) | Combinación final |
| --- | --- | --- |
| Lectura en frío, por página de cada fuente | `14 + 7` | `2 + 7` |
| Segunda lectura sin cambios | `14 + 7` | `1`, mismo resultado |
| Lectura después de registrar una comida | `14 + 7` | `2 + 7`, revisión nueva |

## Verificación

Base local descartable, con migraciones aplicadas en el orden de abajo:

| Suite | Resultado |
| --- | --- |
| `meal-time-provenance.local.test.ts` | 46 pasan |
| `insights-source-revision.local.test.ts` | 42 pasan |
| `performance-insights.local.test.ts` | 6 pasan, 1 omitida (escala) |
| `insights-integration.local.test.ts`, nueva | 10 pasan |
| `training-feelings-finish-local.mjs --test` | PASS, 35 comprobaciones |

La suite nueva cubre finish con respuesta perdida y recibo por la misma clave, la corrección real `mobile_correct_completed_session`, edición de sensaciones y de comida, descarte y convivencia con los constraints diferidos.

## Convivencia con los constraints diferidos

Son tres, no dos: también `workout_session_exercises_unique_order`.

| Caso, con commits reales | Resultado |
| --- | --- |
| Orden de rutinas, dos escrituras a la misma posición | La segunda espera el bloqueo por usuario antes del commit. `23505`, sin deadlock |
| Intercambio de posiciones y fuente en una transacción | Confirma, el contador sube 1 |
| Alguien tiene el contador | Rutinas y vistas no esperan. Otro commit con fuentes sí, y termina |
| Finish que suma a la rutina frente a una rutina retenida | Espera al inicio, y ambos confirman |
| Finish, rutinas y métricas a la vez por PostgREST | Sin errores, contador exacto |
| Cruce: fuente y misma posición, en vistas y en orden de sesión | La segunda espera sin tener el contador. Uno confirma y el otro recibe `23505`, sin deadlock |
| El mismo cruce de vistas sin fuentes | Espera y `23505`, sin deadlock |

Con la primera versión de #391 ese cruce daba `40P01`. La sección siguiente cuenta por qué y cómo se cerró.

## Cruce con token

**Es alcanzable con un token: era un bloqueo de #391.** Corrección comprobada en esta rama; #391 sigue sin ella.

Cada request de PostgREST es una transacción: `BEGIN`, una sentencia y `COMMIT`, leído del log del servidor. Con la migración de #391 en `567200269112`:

| Operación con token | Clase | Resultado |
| --- | --- | --- |
| `PATCH` de `exercise_order`, otro token o sin token | Sin efecto | 200 sin filas: la RLS no las muestra |
| `POST`, `PATCH` y `DELETE` sobre `progress_views` | Rechazada por permisos | 403, `42501` |
| `mobile_reorder_progress_views` cruzada | Termina sin deadlock | El segundo espera al inicio y recibe `40001`. El contador no se mueve |
| `PATCH` de una fila a la misma posición, con gancho y sin él (300 pares) | Termina sin deadlock | Un ganador, 409 con `23505`. El recheck va antes que el contador en la cola |
| `PATCH` de dos filas de sesiones distintas, con gancho | **Permitida, da `40P01`** | 500. El ganador depende del momento, y cada transacción es entera o nada |
| El mismo `PATCH` frente a uno de 4001 filas, sin gancho, 100 ms después | **Permitida, da `40P01`** | **9 de 15 rondas** |

Las funciones que escriben vistas no escriben fuentes y se ordenan por usuario, así que ese cruce queda solo para quien escribe sin pasar por ellas: no es alcanzable con token.

El `PATCH` directo no es un camino de los clientes: Web y Mobile usan funciones que bloquean la sesión primero. Pero el permiso existe y lo usa cualquiera con su propio token. Solo se afecta a sí mismo.

### Corrección
Dos pasadas en `insights_source_changed`: ver el encabezado de la migración. Es un cambio sobre un archivo aún no aplicado en producción.

- **Una primera versión no sirvió:** `SET CONSTRAINTS ... IMMEDIATE` desde el trigger. En un commit los eventos ya están marcados y no adelanta nada. El deadlock seguía.
- **Otra versión tuvo costo cuadrático:** borrar cada nota buscándola entre las de la transacción llevó el `PATCH` grande a 2,4 s por ronda. Por eso se borra por id.

Resultado con la corrección:

| Prueba | Antes | Ahora |
| --- | --- | --- |
| Dos filas con gancho, 200 ms y 1500 ms | `40P01` | T1 confirma, T2 recibe 409 `23505`. T2 entera sin aplicar, contador +1 |
| 4001 filas sin gancho, 100 ms | 9 `40P01` en 15 rondas | 0 en 75 |
| 4001 filas sin gancho, 30 ms y 200 ms | 0 en 15 cada una (sin ventana) | 0 en 15 cada una |
| Cruces de vistas y de sesión desde `psql` | `40P01` | `23505` |
| Tiempo por ronda de 4001 filas, 200 ms | unos 320 ms | unos 375 ms |

Las suites de revisión (42), lectura (6 + 1 omitida), integración (10), cruce con token (15) y recibo (35 comprobaciones) pasan sobre esta versión. La de procedencia (46) no se repitió: no toca estos objetos. No se midió con carga real.

La prueba `sin gancho` depende del momento: 0 deadlocks con la corrección se explica por el orden de la cola, no por esas rondas. Las pruebas con gancho sí fuerzan el cruce en cada corrida.

### Reproducir
El gancho existe solo en la base descartable: frena una request después de escribir y antes de confirmar. No escribe nada ni toma bloqueos del producto.

```bash
export OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=supabase_db_ownlevel-receipt-<8 hex>
npx vitest run src/lib/mobile-api/insights-token-crossing.local.test.ts
```

Para ver el fallo, aplicar antes la versión anterior: `git show 03d12c732143:supabase/migrations/20261104190000_insights_source_revision_expand.sql`.

Los dos requests, con `$SHARED` el ejercicio de las 4001 filas y `$HEAD` y `$TAIL` dos filas de sesiones distintas, una de ellas en la sesión de una de esas filas:

```bash
curl -X PATCH "$API/rest/v1/workout_session_exercises?exercise_id=eq.$SHARED&select=id" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"exercise_order":3000}' & sleep 0.1; curl -X PATCH "$API/rest/v1/workout_session_exercises?id=in.($HEAD,$TAIL)&select=id" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"exercise_order":3000}'; wait
```

## Fallos separados de main

Mismos fallos en esta rama y en `b5e57e3`:

- `training-session.test.ts`: `retains ownership, source validation…`.
- `active-session-bridge-screen.test.tsx`: 4 pruebas.
- `session-return-dock.test.tsx`: 1 prueba. Falla al correr el conjunto en las dos ramas y pasa sola.
- `active_session_add_to_routine.sql`, `active_session_append_empty.sql` y `m3_3b_active_session.sql`: igual con y sin #391. Comparadas en la entrega anterior, no contra main.
- Lint: la advertencia de `meal-rpc.ts` ya está en main.

## Orden de migraciones, backend y adopción

Producción está en `20261104024300_training_feelings_finish_receipt` (lectura del historial del 2026-11-05).

1. **Migraciones**, en este orden: `20261104180000_meal_time_provenance_expand`, `20261104190000_insights_source_revision_expand`.
2. **Backend EXPAND:** #387 y #391.
3. **Motor:** #385 y #386, y enseguida #392 y #389. Quien entre segundo entre estos dos lleva la resolución de la prueba local.
4. **Adopción de clientes:** #388 y #383. ChatGPT es un paso manual: reimportar el esquema y agregar `time_stated_by_user`.
5. **UI:** #390, con su build de Mobile. Recién ahí se expone Insights.
6. **OBSERVE:** 503 de Insights, errores `40P01`, duración de commits y aciertos de reutilización.

Solo se probó #387 antes que #391. No se probó con carga real.
