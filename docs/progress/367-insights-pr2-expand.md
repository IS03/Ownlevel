# Insights #367 — PR 2: EXPAND de sensaciones

**Estado: migración preparada y probada en PostgreSQL efímero; NO aplicada en producción.** Sin deploy ni adopción cliente. Rama `codex/367-insights-pr2-expand`, apilada sobre `codex/367-insights-pr1-comparator` porque [#381](https://github.com/IS03/Ownlevel/pull/381) sigue abierto en `dde9ae4f5d6683fff918e02478bc2c8a0b4d6a16`. No se mergea #381/#380 ni se modifica el comparador revisado. Esta autorización corresponde únicamente al PR 2 de [#367](https://github.com/IS03/Ownlevel/issues/367).

## Persistencia mínima

`workout_session_feelings` guarda una fila operativa por sesión: FK `session_id` con cascade al borrar físicamente la sesión, `revision` CAS monotónica, `facts` y `updated_at`. La ausencia de fila equivale a revisión 0 y ningún hecho; no inicializa cuatro escalas ni copia energía histórica. `facts` tiene solo cuatro claves posibles: `energyPre`, `fatiguePre`, `energyPost`, `fatiguePost`. Son opcionales, ordinales 1–5 e independientes. CHECK valida claves, valores e instrumento; no es una tabla de resultados analíticos.

Cada hecho conserva `instrumentVersion=energy-fatigue/1`, `declaredMoment=pre|post`, `declaredAt` (hora del hecho declarada, nullable), `capturedAt` (hora cliente de captura, nullable), `receivedAt` (recepción en la función de base), `source=mobile|web` declarado y `temporalQuality=unknown|unverified_client_clock` asignado por servidor. No hay estado `verified` aceptable por cliente. Horas ISO con offset/Z, hasta microsegundos; CAS no se reserializa con `Date`.

Una declaración pre ingresada tarde conserva su fase declarada, **no acredita captura previa al esfuerzo**. La hora de recepción no es la hora de la sensación. Reloj/procedencia cliente son declaraciones, no atestaciones; tampoco la primera serie registrada demuestra cuándo ocurrió físicamente el esfuerzo. Este PR almacena procedencia; no calcula elegibilidad temporal analítica.

RLS de lectura hereda ownership del padre `workout_sessions`, por PK indexada; no se duplica `user_id`. `authenticated` tiene SELECT propio, sin DML directo. La RPC de mutación usa `SECURITY DEFINER` únicamente para el ledger privado existente y el write controlado; `search_path=''`, identidad `auth.uid()`, lock compartido de entrenamiento, verificación explícita de ownership, CAS y validación también en SQL. Sin `userId` cliente ni `service_role` en rutas. La RPC de lectura es invoker. Helpers y RPC no son ejecutables por PUBLIC/anon; no se amplían grants legacy.

## Contratos optativos

Nuevas rutas Mobile API v1, con auth Bearer existente, sin caché ni reintentos automáticos de escrituras:

| Ruta de sesión | Contrato |
| --- | --- |
| `GET /training/sessions/{id}/feelings` | Estado actual, revisión y hechos nuevos; nunca proyecta energía legacy. |
| `PATCH /training/sessions/{id}/feelings` | `operation=save`, patch explícito con CAS e idempotencia. |
| `POST /training/sessions/{id}/finish-with-feelings` | `operation=finish`, mismo patch + CAS de sesión y metadata legacy parcial; transacción única. |

Todos los writes requieren `contractVersion=training-feelings/1`, `operation`, `expectedRevision`, `patch`, `idempotencyKey`. Finish requiere además `expectedSessionUpdatedAt` y `metadata` (puede ser `{}`). Se rechazan campos/versiones desconocidos y query params. El contrato TS se comparte para la futura adopción; todavía no se importa en Expo ni hay captura/journal cliente.

```json
{
  "contractVersion": "training-feelings/1",
  "operation": "save",
  "expectedRevision": 0,
  "idempotencyKey": "synthetic-example:1",
  "patch": {
    "energyPre": {
      "op": "set", "value": 3, "instrumentVersion": "energy-fatigue/1",
      "declaredMoment": "pre", "declaredAt": null, "capturedAt": null, "source": "mobile"
    }
  }
}
```

Omitir una clave preserva exactamente su hecho/procedencia. `{"op":"clear"}` elimina esa clave; `null` implícito es inválido. `set` reemplaza el hecho completo con su nueva procedencia/recepción. Un patch no vacío avanza revisión una vez, incluso si borra una clave ausente; la fila vacía conserva la revisión y evita ABA tras borrar todo. Patch `{}` no cambia revisión ni crea hechos. Es estado operacional corregible con revisión y recibos; no agrega un journal de revisiones de sensaciones.

Respuesta nueva estricta: `contractVersion`, `sessionId`, `sessionStatus`, `sessionUpdatedAt`, `endedAt`, `revision`, `values`. Valores ausentes no son ceros. Error de fuente/migración desactivada devuelve indisponibilidad, nunca un objeto vacío exitoso. Clientes instalados siguen en sus rutas, parsers, payloads y receipts originales. Única ampliación compartida: código de conflicto `FEELINGS_CHANGED`, emitido solo por las rutas nuevas.

## Guardado, finish y recuperación offline futura

- Lock por usuario existente → sesión propia → ledger/fila de sensaciones; las demás escrituras de entrenamiento usan el mismo lock. CAS de sensaciones separado del token de estructura/metadata de sesión. Save admite sesión activa o completada (incluida corrección tardía); descartada bloquea writes y conserva hechos para lectura.
- Reutiliza `mobile_idempotency_keys` con namespaces `training.feelings.save.v1` y `training.feelings.finish.v1`, hash de sesión + solicitud y recibo inmutable. Expiración `infinity`, deliberada para futuras colas offline: no hay ventana tras la cual una clave olvidada pueda duplicar una operación. Los receipts se conservan hasta borrado de cuenta por el FK existente a `auth.users`; borrar físicamente una sesión elimina sus hechos por FK, pero no purga el ledger. Descartarla lógicamente conserva ambos. No se crea otro ledger ni una política de purga nueva.
- Mismo usuario/operación/clave y mismo request recuperan el recibo exacto **antes de evaluar CAS/lifecycle**. Otro contenido con esa clave da `IDEMPOTENCY_KEY_REUSED`; CAS obsoleto da `FEELINGS_CHANGED` o `SESSION_CHANGED`. No hay rebase/retry automático. El recibo prueba ese commit, no que siga siendo la última revisión: releer después de recuperar y antes de resolver un conflicto.
- Finish guarda patch + llama al **dominio vigente** `finish_workout_session` + almacena recibo en una transacción. Conserva efectos actuales de notas, objetivos y adiciones de rutina. Cualquier fallo revierte hechos, sesión, rutina y recibo; respuesta perdida tras commit se recupera repitiendo el mismo request/clave. Otro finish con clave nueva sobre sesión completada da `SESSION_CLOSED`.
- `metadata` del finish permite solo `energyLevel`, `performanceLevel`, `painLevel`, `notes`, todos opcionales. Omisión conserva el valor legacy; null lo borra expresamente. Se preservan también pain_note, cardio, abs y nombre omitidos. No se escribe energía post como alias de energía legacy ni se reinterpretan valores previos.
- Futuro journal: persistir **antes de enviar** operación, sesión, contrato, instrumento/procedencia, patch, CAS y clave; conservar cuerpo/clave byte-semánticamente estables para recuperación. En timeout/desconexión no asumir fallo ni emitir otra operación/clave. Tras 409, leer estado y pedir una resolución explícita; cualquier nueva intención usa nueva clave/CAS. Esta entrega define el protocolo, no implementa la cola ni cambia UI/offline actuales.

## Rollout y desactivación

EXPAND: revisar el SQL y su fixture → aplicar migración aditiva en entorno controlado con autorización propia → verificar permisos/RLS/RPC allí → publicar backend compatible con autorización propia → ADOPT de clientes nuevos en PR 3 → OBSERVE. La entrega actual termina en migración preparada/probada, sin ejecutar esas acciones sobre producción. No hay CONTRACT ni eliminación de campos/rutas legacy.

Para cumplir el límite de no desplegar al publicar el PR, `vercel.json` deshabilita las previews automáticas **solo** en `codex/367-insights-pr2-expand` mediante `git.deploymentEnabled`. No cambia el despliegue de main u otras ramas; no se toca la configuración remota del proyecto.

`supabase/rollbacks/training_feelings_disable.sql` revoca ejecución de las dos RPC nuevas a authenticated. Es desactivación conservadora, no DROP: conserva tabla/hechos/receipts/RLS y funcionamiento legacy. Writes pendientes quedan sin confirmación hasta resolver/reanudar, conservando clave/cuerpo. Rehabilitar requiere revisar y restaurar los grants; nunca volver a crear filas con defaults ni purgar receipts como rollback. La prueba ejecuta desactivación y verifica conservación de datos y replay legacy.

## Validación y dependencias diferidas

- Fixtures HTTP/contratos/servidor y regresión focalizada de finish legacy: 51 pruebas (36 nuevas + 15 existentes). Sin llamadas a producción.
- `scripts/testing/training-feelings-postgres.mjs`: 88 aserciones sobre PostgreSQL real efímero, usando esquema Training sintético y funciones vigentes de migraciones. Incluye ACL efectiva/RLS, dos usuarios y conexiones concurrentes, omitir/borrar, CAS, reintentos y respuesta perdida, finish simultáneo, fallo inyectado al persistir recibo después de efectos de rutina, rollback completo, conservación legacy, desactivación y recuperación al rehabilitar.
- Runner local: instalar tooling externo fijado `embedded-postgres@18.6.0-beta.19`, luego definir `OWNLEVEL_TEST_MODULES` a ese `node_modules` y ejecutar `node scripts/testing/training-feelings-postgres.mjs`. Abre solo loopback/puerto efímero y borra su base al terminar; no acepta URLs de base remota. La prueba usa PostgreSQL 18.6; no representa un replay integral de migraciones ni E2E contra PostgREST/Supabase alojado.
- Typecheck de raíz, ESLint focalizado y diff/whitespace: correctos. `supabase db advisors --type security --fail-on error` se intentó únicamente contra el stack local `127.0.0.1:55422`, pero está apagado; advisor completo pendiente. La prueba efímera sí verifica ACL efectiva, RLS y `search_path` del RPC privilegiado. Sin instalaciones de dependencias Expo ni cambios de locks. No se repiten QA/pruebas de #380 ni calibración/comparador #381.

Brechas históricas del comparador siguen explícitas: configuración histórica verificable, unidad/procedencia e implemento ausente en ciertos snapshots no se reconstruyen desde el catálogo vigente; requieren decisión/EXPAND posterior si se necesitan. Este PR no cambia snapshots ni clasificaciones. Revisiones semánticas de métricas y revisión global de fuentes corresponden al futuro loader/invalidación, no son prerrequisitos de estos cuatro hechos. Tampoco hay captura cliente, journal, all-time, asociaciones, promoción ni garantías del objetivo hipotético del 1 %.
