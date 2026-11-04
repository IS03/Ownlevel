# #383 — EXPAND del recibo de finish con sensaciones

Prerrequisito separado de la adopción de #383; **no es Insights PR 4**. Base main `cf26212d1bc6df09fc359e1a6717d8a544d31258`. Migración nueva **aplicada en producción con autorización explícita** como `20261104024300_training_feelings_finish_receipt.sql`; publicación del backend y verificación HTTP son el paso siguiente. La migración anterior `20261104011622_training_feelings_expand.sql` conserva su versión y contenido.

## Contrato y recibos

`POST /api/mobile/v1/training/sessions/{id}/finish-with-feelings` sin query mantiene exactamente `training-feelings/1`. Opt-in `?routineAdditions=1` acepta el mismo cuerpo v1 y devuelve `{ contractVersion: "training-feelings-finish/2", feelings, finished }`. `feelings` es la respuesta v1 intacta; `finished` conserva las 14 claves del finish previo negociado, incluida metadata, cantidades y `routineAdditions` con los cuatro outcomes existentes. Otros parámetros/duplicados se rechazan. GET/PATCH, finish anterior y builds instaladas no cambian.

Fuentes revisadas: `mobile_finish_training_session_v2`, ledger privado existente y `workout_session_exercises.routine_addition_outcome`. El dominio ya persiste outcomes por sesión. La función nueva `finish_training_feelings_v2` verifica identidad/ownership, usa el lock de entrenamiento y llama **una vez** a `mutate_training_feelings_v1`. En esa transacción captura el resumen y los outcomes registrados por el finish; nunca consulta el estado actual de la rutina para interpretar un replay ni ejecuta otro finish para reconstruirlo.

Namespace durable `training.feelings.finish.v2`, hash estable de sesión/cuerpo y expiración infinity, como las sensaciones v1. El ledger v1 y el recibo nuevo se confirman o revierten juntos. Los replays v2 leen primero su recibo original: mantienen nombre, metadata, cantidades, outcomes y tiempos aunque después cambien sesión/rutina. La retención hereda el borrado de cuenta del ledger existente.

Un recibo v1 previamente confirmado no contiene el resumen original: **no se convierte** a v2. Intentar negociar v2 con esa misma clave devuelve `409 FEELINGS_RECEIPT_VERSION_UNAVAILABLE`; no fabrica historia. #383 persiste también la negociación de cada intención: las anteriores continúan en v1, las nuevas eligen v2. No hay fallback a otro finish ante timeout, 400/503 o respuesta v1 inesperada.

Nueva RPC SECURITY DEFINER con `search_path=''`, timeouts, auth.uid/ownership explícitos y EXECUTE solo authenticated (PUBLIC/anon revocados). No agrega tablas, columnas, grants de DML ni políticas legacy. Rollback conservador: `supabase/rollbacks/training_feelings_finish_receipt_disable.sql` revoca la RPC nueva, conservando hechos/recibos y funcionamiento v1.

## Evidencia local

- Supabase CLI 3.0.0, Docker Linux 29.9.2, PostgreSQL 17.11, stack aislado `ownlevel-receipt-3ee7ddaa`, DB `127.0.0.1:53129`. Se aplicaron los 88 SQL de main en una base nueva y luego `20261104024300_training_feelings_finish_receipt.sql`. Sin reset de bases existentes ni URLs remotas.
- **35 comprobaciones reales con Auth/PostgREST y usuarios sintéticos**: ownership/anon/ACL, cuatro outcomes, metadata legacy conservada, respuesta perdida simulada después del commit, replay exacto tras cambiar notas/nombres/outcomes y quitar el ejercicio de la rutina, ausencia de segundo finish, conflicto por clave distinta/contenido, v1 intacto, rechazo de upgrade imposible, fallo inyectado después de efectos del dominio con rollback de ambos ledgers/hechos/rutina, concurrencia y desactivación/rehabilitación.
- Advisor de seguridad local antes/después: salida 0 y `results: []` en ambos. No se consulta el advisor alojado ni se afirma que su baseline sea cero.
- **45 pruebas HTTP/contrato**: 9 nuevas y 36 de las rutas v1 afectadas por la negociación. Typecheck raíz y lint focalizado sin warnings. No se repiten comparador, auditorías históricas ni suites ajenas.
- Runner reproducible: `scripts/testing/training-feelings-finish-local.mjs` requiere un workdir local explícito con project_id descartable validado; rechaza esquemas existentes en bootstrap y destinos no loopback. Las credenciales del status local quedan fuera del checkout y no se imprimen. La instancia sintética se detiene/elimina por su project_id después de verificar.

## Orden de integración autorizado por separado

Revisar este borrador → autorizar/aplicar la migración nueva → verificar permisos/recibos → autorizar/publicar backend compatible → verificar negociación → integrar/publicar #383 y hacer su QA física. La aplicación de la migración ya está autorizada y completada; la publicación del backend está autorizada y sigue a su verificación. Ambas ramas bloquean previews automáticas. El módulo portable de recibo y esa configuración son idénticos en ambas ramas; no se incorpora el resto de la adopción en este PR.

La checklist física única sigue en `docs/progress/367-insights-pr2-expand.md` de #383. Pendientes al registrar la aplicación: publicación/verificación del backend y QA física iOS, incluidos lock ausente/rechazado y respuesta perdida con adiciones a rutina.

## Registro de aplicación autorizada — 3 de noviembre de 2026 (Córdoba)

- SQL revisado en `c97bb3d531b2dc3797f5c6f44bbfed75557bb936`, blob `6946634e7a6e154074f00f2d27c29eea9d569e49`. Aplicado sin cambiar su contenido.
- Supabase MCP asignó la versión `20261104024300` (4 de noviembre UTC). Se renombra el archivo y se actualiza el runner para coincidir con esa versión; no se edita el historial de migraciones ni se reaplica `20261104011622`. La evidencia local anterior conserva validez para el mismo SQL.
- Verificación alojada: cuerpo de la RPC idéntico al revisado, `search_path` vacío y timeouts esperados; `PUBLIC`/`anon` sin EXECUTE y `authenticated` con EXECUTE. Las tres dependencias v1 conservan sus hashes previos. Sin escrituras de datos personales; invocación sin identidad rechazada con `UNAUTHORIZED`.
- Advisor alojado: baseline 3 INFO por RLS sin políticas en tablas privadas, 20 WARN por RPC definer autenticadas y 1 WARN de protección de contraseñas. Después: mismos avisos y una RPC definer adicional, `finish_training_feelings_v2` (21). Es exposición intencional con identidad/ownership explícitos; no se afirma advisor alojado sin hallazgos. [Referencia del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- La verificación autenticada de mutación/replay sigue siendo la local con datos sintéticos; no se crean entrenamientos de prueba en producción. #383 permanece en borrador, sin integrar; QA física pendiente.
