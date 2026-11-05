# #367 — Rollout de producción, 2026-11-05

Estado registrado: 2026-11-05T21:16:52.207Z. Autorización expresa del usuario en esta sesión para las dos migraciones y el rollout.

## Resultado

Los cinco PR se mergearon mediante la API de GitHub, con head SHA esperado, sin auto-merge y de a uno. Antes de seguir se confirmó READY del despliegue anterior.

| PR | Merge en main | Despliegue |
| --- | --- | --- |
| #387 | 1978808c92d39c897abfcb298a90cf1b19343dd3 | dpl_7iiQSvRLRNqm7DE1keAEtcGW1r1q — READY |
| #388 | 8322b2886dd379cea0b4d267ef094d7a0d809039 | dpl_Dd9tW5hks7aedJQayGrkdhdvQt7Q — READY |
| #391 | b4cf6a3aef6537a85826c0303ba56ecc33ef88ae | dpl_48qcYR1G2T1Z3LFqa5weALC5Mt7C — READY |
| #392 | 4ba083b58596bca17917df756eaab070c9faafb6 | dpl_2AoqZ827Ht9YgajiTpzzKoBcg9LR — READY |
| #389 | 07ee16acd9ed62b62f234b278ca10a5f0e343a1b | dpl_74ESZKLr5a8HhWwiAKSuW6fMQy9X — READY |

Último despliegue con alias ownlevel.fit y www.ownlevel.fit. Las cinco descripciones de GitHub se actualizaron con el estado del rollout.

## Migraciones: versiones efectivas y SQL intacto

| PR | Versión del plan | Versión efectiva en producción y Git | Blob aprobado |
| --- | --- | --- | --- |
| #387 | 20261104180000 | 20261105210605_meal_time_provenance_expand.sql | 54e431df06a2090f69df049cc09cfc997342bc68 |
| #391 | 20261104190000 | 20261105211040_insights_source_revision_expand.sql | 25181ddd08295d1c143ba9771d739dcd9150f40e |

Supabase asignó timestamps efectivos al aplicar cada migración. Un intento de cambiar manualmente la versión del historial fue rechazado por la revisión automática por riesgo y falta de autorización específica para esa mutación del historial. No se ejecutó ese cambio y no se intentó por otra vía.

Se conservó el historial original de Supabase y se renombraron los archivos de Git para coincidir con él. También se ajustaron las referencias de los fixtures locales. Commits: e7481cf167d919d06384af9ed3202ac5a658184b (#387) y 19b4fe41234901d74b278d589f666d9a1752a486 (#391). Los dos blobs SQL son exactamente los aprobados. El árbol final de main contiene solo los archivos con las versiones efectivas; no contiene sus duplicados con las versiones del plan. No volver a aplicar estos scripts.

## Comprobaciones realizadas en producción

- Antes: main 26081d9 y última migración 20261104024300; ambas expansiones ausentes.
- #387: trigger de guarda activo. Las 868 filas preexistentes quedaron con procedencia nula; no hubo backfill.
- #391: 8 triggers de fuentes y 1 de segunda pasada, activos y diferidos.
- RLS habilitada en las dos tablas. Contador persistente, tabla auxiliar UNLOGGED. Política del contador: SELECT propio para authenticated.
- Tabla auxiliar y secuencia: sin SELECT/INSERT/UPDATE/DELETE ni USAGE/SELECT/UPDATE respectivamente para anon, authenticated y service_role.
- Funciones internas de revisión: sin EXECUTE para anon y authenticated.
- Al cierre: 0 notas pendientes y 0 advisory locks esperando.
- HTTP GET sin identidad a /api/mobile/v1/progress/performance-insights: 401. No prueba la lectura autenticada del motor.
- Ventana breve de logs PostgreSQL desde 21:10:40 UTC hasta el chequeo de cierre: 0 coincidencias de deadlock/40P01 y 0 de 55P03. Son solo los eventos disponibles en esa ventana, no prueba de carga ni de ausencia general de deadlocks.
- Vercel: sin errores de runtime encontrados en la consulta de últimos 30 minutos al cierre.

## Advisors

Antes: seguridad con 21 advertencias de funciones SECURITY DEFINER accesibles a usuarios autenticados, 1 de protección de contraseñas filtradas y 3 informativos de RLS sin políticas en tablas privadas.

Después: mismas advertencias; un informativo adicional RLS sin políticas en public.insights_source_pending. Es intencional: tabla auxiliar cerrada por ACL y RLS, solo escrita por las funciones internas. No se agregó política pública para ocultar el aviso.

Performance antes/después: 1 FK sin índice, 1 auth_rls_initplan y 2 índices sin uso; sin nuevos hallazgos en la revisión realizada. No se corrigió deuda ajena.

## Evidencia reutilizada

Se reutilizó la validación local publicada de PostgreSQL 17.6.1.105 y 17.11, con sus límites. No se repitieron campañas, suites de Mobile ni pruebas de base en producción. Los cambios nuevos de esta ejecución fueron el rollout, los nombres de los archivos y sus referencias de fixtures, no SQL ni lógica de aplicación.

El paquete anterior y sus resultados siguen disponibles en el commit 1fc1b23bf2869ec6b9f80d85faa3cb2fe04c02c9. Allí se distinguen las pruebas nuevas de las históricas y lo no ejecutado.

## Pendientes reales

- OBSERVE durante uso normal: errores y esperas, costo de escritura por cuenta, 503 de Insights y aciertos de reutilización. No se completó una observación de varios días.
- QA física única: [checklist](367-qa-fisica.md), diferida y no aprobada.
- Sin build ni instalación de Diario. El código Mobile integrado llegará al dispositivo cuando se haga una build autorizada.
- Sin finish ni lecturas autenticadas de Insights ejecutadas aquí en la cuenta real. No se hicieron escrituras sintéticas en producción.
- La herramienta OWNLEVEL Comidas visible en esta sesión todavía no expone time_stated_by_user. Falta actualizar/reimportar su esquema o reconectar según el cliente; no se fingió una actualización ni se registraron comidas de prueba.
- A 10 años: pico de memoria aproximado de 209 MiB y 268 consultas de lectura en frío pendientes. Detalle por defecto paginado de 10,9 KiB; evidencia completa a pedido.
- “Consistente” permanece deshabilitado. Riesgo del 1 % y captura de configuración siguen como decisiones de producto.
- #367 continúa abierto; el rollout no equivale al cierre de todos sus criterios.

## Continuidad local

Hacer fetch y actualizar main antes de continuar. No aplicar las versiones antiguas del plan ni reparar el historial para sustituir los timestamps efectivos. Las rutas vigentes son las dos de la tabla superior.

La rama integration/367-insights-candidate incorpora main final y preserva el registro y la prueba exclusivos de integración. Sus previews están explícitamente deshabilitadas. Los checkpoints locales del usuario no se modificaron.

## Continuidad: captura y cobertura (2026-11-06)

Tres ramas publicadas desde `main` `07ee16a`, con previews deshabilitadas. **Los PR en borrador no están creados:** esta máquina no tiene sesión de GitHub. El texto de cada uno está en su rama.

| Rama | Head | Necesita antes | Descripción |
| --- | --- | --- | --- |
| `codex/367-chatgpt-capture-schema` | `bac622d01b09e7d9306ef564ce0d1b70f9a8fb74` | Nada | `docs/progress/367-chatgpt-capture-pr-description.md` |
| `codex/367-exercise-configuration-expand` | `64761eea02525d591e45e88f5eaf03502e3b92e5` | Aplicar su migración `20261106120000_training_exercise_configuration_expand.sql`, blob `25457aa321349d3b6ac43ba8737146f0d0aa824e` | `docs/progress/367-exercise-configuration-expand-pr-description.md` |
| `codex/367-exercise-configuration-adopt` | `3d1474daa735676f7b136410aed086c2c21cdc4e` | La migración y el EXPAND; contiene sus commits | `docs/progress/367-exercise-configuration-adopt-pr-description.md` |

**Paso manual de ChatGPT:** sigue pendiente en cada conexión instalada, y lo hace su dueño: [chatgpt-nutrition.md](https://github.com/IS03/Ownlevel/blob/codex/367-chatgpt-capture-schema/docs/integrations/chatgpt-nutrition.md#paso-manual-actualizar-las-conexiones-de-chatgpt-367).

**Matriz de cobertura:** [367-matriz-cobertura.md](https://github.com/IS03/Ownlevel/blob/codex/367-exercise-configuration-adopt/docs/progress/367-matriz-cobertura.md). La checklist de QA física sigue siendo una sola, ahora con la variante: [367-qa-fisica.md](https://github.com/IS03/Ownlevel/blob/codex/367-exercise-configuration-adopt/docs/progress/367-qa-fisica.md).

**Sin cambios:** ninguna migración nueva aplicada, ningún merge y ningún despliegue. «Consistente» sigue deshabilitado y #367 sigue abierto.

## Continuidad: variantes completas y verificadas (2026-11-06)

ChatGPT abrió los PR en borrador. **No hay merges, migraciones remotas ni deploys.** Producción sigue en `07ee16a`.

| PR | Rama | Head | Necesita antes |
| --- | --- | --- | --- |
| #393 | `codex/367-chatgpt-capture-schema` | `bac622d01b09e7d9306ef564ce0d1b70f9a8fb74` | Nada; sin cambios en esta tanda |
| #394 | `codex/367-exercise-configuration-expand` | `a51f0858139d3f62b61e4ebfb2d394a6532a4a4c` | Aplicar `20261106120000_training_exercise_configuration_expand.sql`, blob `85aaeb254c68bafe2a9834e9d118f415f3075648` |
| #395 | `codex/367-exercise-configuration-adopt` | `a8924704443cbddb84331d45b3e988d3f6d097f8` | La migración y #394; contiene sus commits |

**El blob de la migración cambió frente al paquete anterior** (`25457aa…`): agrega `recorded_phase`. Nunca se aplicó fuera de bases descartables.

**Verificado en PostgreSQL 17.6.1.105 con PostgREST y Auth,** en la pila local descartable `ownlevel-receipt-81c940df`:
- las 8 pruebas afectadas de #391 y las 3 guardas de cruce;
- 5 pruebas de configuración de punta a punta.

**Captura:**
- Mobile: en curso y en la sesión completada.
- Web: en el editor de sesión, en curso y completada.

**Descripciones vigentes:** `docs/progress/367-chatgpt-capture-pr-description.md` (en #393), `367-exercise-configuration-expand-pr-description.md` (en #394) y `367-exercise-configuration-adopt-pr-description.md` (en #395). No se editaron en GitHub: esta máquina no tiene sesión.

**Enlaces:**
- [Paquete de rollout](https://github.com/IS03/Ownlevel/blob/codex/367-exercise-configuration-adopt/docs/progress/367-exercise-configuration-rollout.md)
- [Matriz](https://github.com/IS03/Ownlevel/blob/codex/367-exercise-configuration-adopt/docs/progress/367-matriz-cobertura.md)
- [Checklist física única](https://github.com/IS03/Ownlevel/blob/codex/367-exercise-configuration-adopt/docs/progress/367-qa-fisica.md)

**Próximos incrementos, separados y sin implementar:** convención del sueño, peso corporal en Insights, y todas las sesiones y macros en el contexto del día.

«Consistente» sigue deshabilitado y #367 sigue abierto.

