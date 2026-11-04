# Insights #367 — EXPAND y ADOPT de sensaciones

**Estado vigente: EXPAND aplicado y verificado en Supabase de producción; ver sección final de rollout.**

**PR 3: adopción Web/Expo y journal local implementados; entrega en borrador, QA física iOS pendiente.** Base `cf26212d1bc6df09fc359e1a6717d8a544d31258`. Este trabajo no aplica/reaplica migraciones ni cambia producción.

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
- Typecheck de raíz, ESLint focalizado y diff/whitespace: correctos. El intento inicial de advisor encontró el stack local `127.0.0.1:55422` apagado; la verificación posterior completa y satisfactoria en otra instancia descartable se registra al final. La prueba efímera verifica ACL efectiva, RLS y `search_path` del RPC privilegiado. Sin instalaciones de dependencias Expo ni cambios de locks. No se repiten QA/pruebas de #380 ni calibración/comparador #381.

Brechas históricas del comparador siguen explícitas: configuración histórica verificable, unidad/procedencia e implemento ausente en ciertos snapshots no se reconstruyen desde el catálogo vigente; requieren decisión/EXPAND posterior si se necesitan. Este PR no cambia snapshots ni clasificaciones. Revisiones semánticas de métricas y revisión global de fuentes corresponden al futuro loader/invalidación, no son prerrequisitos de estos cuatro hechos. Tampoco hay captura cliente, journal, all-time, asociaciones, promoción ni garantías del objetivo hipotético del 1 %.

## Historial de verificación del stack completo — 03/11/2026

### Intento inicial: faltaban herramientas (resuelto posteriormente)

Punto de partida verificado: checkout limpio en `codex/367-insights-pr2-expand`, HEAD y rama remota `192efa674e49ec9e5a0f6b59a2a2ec5d9356e53f`; #382 abierto, sin merge. Se consultaron AGENTS, esta documentación, la configuración local y el bootstrap versionado. No hubo correcciones de SQL/contratos ni cambios de aplicación en esta verificación.

Entorno observado: Windows 11 Pro `10.0.26300` (build 26300), Node `v22.18.0`, npm `11.5.2`, Supabase CLI `3.0.0` vía npx, WinGet `1.29.380`. Docker/Podman no disponibles; Docker Desktop no figura instalado ni en las ubicaciones estándar. WSL informa que no está instalado; la sesión no es administradora y `HypervisorPresent=false` (esto no diagnostica por sí solo la configuración del BIOS).

Preparación local intentada, sin elevar privilegios ni reiniciar Windows:

1. `wsl --install --no-distribution --no-launch`: salida 1, informa WSL no instalado.
2. WinGet verificó el paquete oficial `Microsoft.WSL` 2.7.14 y el hash del instalador. La instalación con ámbito user/silent falló con **`0x80073d28`: administrator privileges are required**. WSL no quedó instalado.
3. Se creó solo una configuración temporal en `%TEMP%/ownlevel-382-fullstack-a55341f2ac`, con project_id único, seed/migraciones automáticas deshabilitados como en el proyecto y puertos libres asignados (API 59534, DB 59535). No se modificó `supabase/config.toml` del checkout ni se enlazó un proyecto remoto.
4. Tras consultar `start --help`, se intentó `supabase start` en ese workdir aislado, conservando DB/Auth/Kong/PostgREST y excluyendo servicios auxiliares. Falló con **`DockerLifecycleInspectError`: docker: command not found (podman also not found)**, salida 1. No se creó instancia, base, contenedores ni volúmenes y no se reseteó una base existente.

| Verificación solicitada | Resultado de este intento |
| --- | --- |
| Integración de toda la secuencia de migraciones, incluida #382 | **PENDIENTE/BLOQUEADA**: el stack no pudo arrancar; no se aplicó ninguna migración en esta verificación. El fixture previo no demuestra integración del esquema completo. |
| Advisor de seguridad del stack aislado | **PENDIENTE/BLOQUEADO**: no existe instancia local arrancada contra la cual ejecutarlo. No hay informe ni afirmación de cero hallazgos. |
| Hallazgos introducidos por #382 frente a preexistentes | **NO EVALUADOS**: requieren el advisor y la comparación con el esquema anterior a la migración. No se hizo limpieza de deuda histórica. |
| Smoke PostgREST: usuarios sintéticos, lectura propia/ajena, guardar/replay/finish y contrato legacy | **PENDIENTES/BLOQUEADOS**: Auth/PostgREST no están disponibles. No se sustituyen por mocks HTTP ni por acceso SQL directo. |
| Producción | **SIN APLICAR**: sin bases remotas, datos personales, deploy ni merges. |

Las **51 pruebas y 88 aserciones** anteriores se mantienen como evidencia del head revisado, sin repetirse: no cambiaron sus fuentes ni aparecieron fallos de producto. No aprueban los tres controles pendientes del stack completo.

Para desbloquear: instalar/habilitar WSL 2 desde una sesión de administrador y reiniciar si Windows lo solicita ([Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install)); después instalar/iniciar Docker Desktop con contenedores Linux ([Docker](https://docs.docker.com/desktop/setup/install/windows-install/)). No se pide credencial alguna en el chat. Retomar con un proyecto temporal nuevo o comprobar que este sigue vacío, sin resetear instalaciones preexistentes. Aplicar en orden los SQL versionados, incluido `0001.sql` que el parser del CLI omite; el bootstrap existente documenta ese requisito pero está fijado a otro container y no se ejecutó contra él. Completar advisor antes/después y smoke PostgREST local; hasta entonces el resultado global continúa **no aprobado por falta de verificación de integración**.

### Reanudación tras instalar WSL/Docker — 03/11/2026

Checkout limpio y remoto verificados en `67aca462e9d793d6eaa610ac750983c92e62d531`; #382 continúa abierto. El bloqueo anterior de instalación ya no es el estado vigente: ahora están instalados WSL `3.0.3.0` (kernel `6.18.54.1-1`), Docker Desktop `4.97.0.244584` y Docker CLI `29.9.2` (API `1.56`), en Windows `10.0.26300.9818`. El ejecutable Docker está en la instalación per-user; no fue necesario reinstalar paquetes ni cambiar PATH persistente.

Se abrió Docker Desktop y se inspeccionaron únicamente contextos locales `npipe`. `docker desktop status` informa `stopped`; `docker --context desktop-linux version` devuelve `Server=null`, error HTTP 500, salida 1. WSL informa que WSL 2 no puede iniciar. La comprobación del host indica `VirtualizationFirmwareEnabled=true`, `VirtualMachinePlatform InstallState=1` y `HypervisorPresent=false`: no se atribuye el problema a BIOS deshabilitado ni se interpreta el mensaje genérico de la API como una incompatibilidad demostrada de versión.

Tras consultar la ayuda de WSL, se ejecutó la preparación rutinaria `wsl --install --no-distribution --no-launch`. Esta vez **terminó con salida 0**, pero Windows indicó expresamente: **“Los cambios se aplicarán una vez que se reinicie el sistema”**. No se reinició Windows automáticamente ni se modificó la configuración BCD. El motor sigue detenido al finalizar el intento.

Resultado vigente: **esquema completo pendiente; advisor pendiente; smoke PostgREST/legacy pendientes; producción SIN APLICAR**. No se arrancó/resetó ninguna base, no se aplicaron migraciones y las 51 pruebas/88 aserciones previas se reutilizan sin repetirlas. Solo cambia esta documentación.

Próximo paso concreto: guardar el trabajo y reiniciar Windows nuevamente para completar la preparación que acaba de confirmar WSL; abrir Docker Desktop y verificar una respuesta de **Server** del motor Linux. Cuando responda, continuar en un proyecto Supabase descartable nuevo con la secuencia SQL completa, advisor comparativo y smoke PostgREST, manteniendo intactas las instalaciones/bases existentes.

### Verificación completada tras el reinicio — 03/11/2026

Esta sección reemplaza los estados pendientes de los intentos anteriores. Punto de partida: checkout limpio y remoto en `abd3750fe92a6778d010af28f766075f09d346c0`, #382 abierto. `docker info` terminó con salida 0: servidor Linux `29.9.2`, kernel `6.18.54.1-microsoft-standard-WSL2`, contexto local `desktop-linux` mediante npipe. No se reinstaló ninguna herramienta ni se pidió otro reinicio. Node `22.18.0`, npm `11.5.2`, Supabase CLI fijado `3.0.0` vía npx; Docker Desktop/WSL conservan las versiones registradas arriba.

**Instancia aislada:** `%TEMP%/ownlevel-382-verify-b8c94dd821`, project_id del mismo nombre; API `127.0.0.1:56970`, PostgreSQL `127.0.0.1:56971`. Configuración copiada a ese directorio con puertos nuevos, sin enlace remoto, seed ni migraciones automáticas. `supabase/config.toml` del checkout permanece intacto. Stack DB/Auth/Kong/PostgREST; auxiliares excluidos. Imágenes: `postgres:17.11.0.011` (servidor PostgreSQL 17.11), `gotrue:v2.197.0`, `postgrest:v16.5`, `kong:2.8.1`, de `public.ecr.aws/supabase`.

| Control | Resultado |
| --- | --- |
| Integración del esquema completo | **APROBADA localmente**: 87 SQL previos, luego `20261104011622_training_feelings_expand.sql`; 88 migraciones completas, en orden por nombre, sin editar/omitir SQL. Cada archivo aplicado mediante `psql -X -v ON_ERROR_STOP=1` dentro del contenedor nuevo, incluyendo `0001.sql`, que no reconoce el parser de nombres del CLI. Sin reset de bases existentes. |
| Advisor de seguridad | **COMPLETADO**: `supabase@3.0.0 db advisors --workdir <aislado> --type security --fail-on error --output-format json`, primero después de los 87 SQL, luego después del EXPAND. Ambos: salida 0, `No issues found`, `results: []`, destino local explícito `127.0.0.1:56971`. **Cero hallazgos preexistentes y cero introducidos en este control**; no se corrigió deuda histórica. |
| Smoke Auth/PostgREST | **APROBADOS: 41 comprobaciones**, dos usuarios sintéticos creados mediante Auth local y autenticados con contraseña; requests HTTP reales a `/rest/v1`, con bearer de cada usuario, sin service_role en las operaciones bajo prueba. |
| Producción | **SIN APLICAR**. Sin base remota, deploy, merge ni PR 3. |

Smoke dirigido: lectura propia inicialmente vacía/revisión 0; rechazo de lectura/escritura ajena y anónima; SELECT ajeno vacío por RLS; INSERT directo denegado; ordinal inválido; guardado; recibo exacto al repetir solicitud/clave (recuperación de respuesta perdida simulada); CAS obsoleto y clave reutilizada con otro contenido; omitir conserva y `clear` borra. Finish completa sesión y post con una revisión nueva, conserva pre y metadata legacy omitida; replay devuelve exactamente el recibo y finish con otra clave rechaza sesión cerrada. Otro usuario finaliza por `mobile_finish_training_session`: se comprueban las claves exactas de su respuesta legacy, replay y conservación de los hechos nuevos, sin crear un alias post. El fixture se sembró por SQL administrativo únicamente en la instancia nueva; no contiene datos personales.

Las **51 pruebas y 88 aserciones previas se reutilizan sin repetirlas**: no hubo cambios de aplicación, contratos ni SQL, ni fallos nuevos. Las 41 comprobaciones agregan la evidencia pendiente del esquema completo y el transporte PostgREST; no son una prueba de UI ni del servidor Next.js desplegado, y la pérdida de respuesta se simula mediante replay del mismo cuerpo/clave, sin cortar la red. El advisor es el de seguridad de la base local; no acredita configuración de un proyecto alojado. No se ejecutaron pruebas de #380 ni del comparador #381.

Evidencia local: `migrate-baseline.log`, `applied.json`, `advisor-before.log`, `advisor-after.log`, `smoke.mjs` y `smoke-report.json` en el directorio temporal indicado. No se publican claves/tokens de Auth. Migración verificada sin modificaciones respecto del head de implementación `192efa674e49ec9e5a0f6b59a2a2ec5d9356e53f`. Al terminar se detuvo **solo** ese project_id con `stop --no-backup`, eliminando sus contenedores/volúmenes sintéticos; no se tocaron otras instancias. Este seguimiento modifica únicamente documentación.

Próximo paso: revisión de #382 y coordinación del rollout EXPAND en un entorno expresamente autorizado. La migración está **preparada y probada localmente**, no aplicada en producción; #382 permanece abierto y sin auto-merge. No se inicia ADOPT/PR 3.

## EXPAND aplicado en producción — 03/11/2026 Córdoba

Autorización explícita del usuario recibida antes de aplicar. Proyecto verificado: OWNLEVEL/gym, `vtxacamtayeqnogxyapd`. Se aplicó el SQL revisado de PR #382 con guards de dependencias y timeouts; sin backfill ni escrituras de sesiones/comidas.

El conector asignó la versión `20261104011622` (UTC). El archivo originalmente revisado era `20261103023740_training_feelings_expand.sql`; se renombra a `20261104011622_training_feelings_expand.sql` y se actualiza el fixture, conservando **el mismo blob SQL**. La revisión automática rechazó reescribir el historial interno: no se reintentó por otra vía; se conserva el registro real y se alinea el repositorio.

Verificado tras aplicar: las cinco funciones nuevas coinciden exactamente con sus cuerpos versionados; `finish_workout_session` y `lock_training_user_mutations` conservan su código. RLS habilitado, SELECT propio para authenticated, sin DML directo ni acceso anon; helpers no ejecutables por authenticated. Una sola entrada de historial con el nombre esperado.

Advisor alojado: baseline de 3 INFO, 19 WARN de funciones SECURITY DEFINER y 1 WARN de Auth. Delta: solo el aviso esperado para `mutate_training_feelings_v1`, RPC privilegiada intencional con auth.uid/ownership/CAS/idempotencia. No se afirma cero avisos alojados. Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .

#381 integrado en `d18af72a1f115789c63fed1c5ceafd0a84fd18f3`, Vercel Production READY. #382 retargeteado a main; publicación de su backend posterior a la verificación de EXPAND. Captura cliente/Diario y patrones siguen sin adoptar. No se repiten las pruebas locales vigentes: el seguimiento solo renombra el SQL sin cambiar su contenido, actualiza su ruta de fixture y documenta el rollout.

## PR 3 — ADOPT y recuperación offline

Rama `codex/367-insights-pr3-adopt` desde main actualizado y limpio; #381/#382 mergeados. Migración vigente `20261104011622_training_feelings_expand.sql`: **ya aplicada**, no se vuelve a ejecutar. Codebase Memory devolvió vacío; checkout y contratos publicados son la autoridad. Sin integración de #380, SQL nuevo, cambios de producción, deploy, build ni instalación de Diario. Se bloquea la preview automática de esta rama en `vercel.json`.

Captura Web/Expo: bloque compacto pre al abrir la sesión; post reutiliza el espacio del formulario final. Energía y fatiga opcionales e independientes, 1–5 sin defaults; anclajes **muy baja/baja/media/alta/muy alta** y **ninguna/poca/moderada/mucha/muchísima**. Se puede quitar cada respuesta. Rendimiento, dolor y notas continúan separados. El control final de energía escribe `energyPost`, nunca energía legacy; se preservan sus valores anteriores. Lectura de sensaciones nuevas en sesión finalizada, sin convertir datos históricos. Controles con semántica accesible, tokens de marca y claro/oscuro; Windows valida render/contratos, no sustituye VoiceOver/QA física.

El contrato portable conserva `training-feelings/1`; las entradas del servidor siguen traduciendo validación a los mismos errores HTTP. Web usa las mismas rutas Bearer y comprueba que la sesión autenticada corresponda al dueño del journal. Expo usa Mobile API, sin consultas directas a tablas. No cambia el comparador.

Journal específico de sensaciones, compartido: `ownlevel.feelings.v1.<usuario>.<sesión>`, sobre localStorage Web y AsyncStorage Expo. Seleccionar persiste patch, fuente y hora real de captura, aunque sea tarde; reenviar conserva esos timestamps y no acredita anterioridad física. Quitar produce `clear`; omitir preserva. Antes de enviar se persiste el cuerpo exacto, CAS y clave. Se serializan lecturas/escrituras por dispositivo/registro; Web exige Web Locks para coordinar pestañas. Si no están disponibles, se muestra error y no se envía. No se guardan tokens en el journal ni se registran payloads privados.

Recuperación tras navegar/reiniciar: intención pendiente visible; «Comprobar operación pendiente» repite exactamente cuerpo/clave. No hay reenvío automático con otra revisión ni nueva clave por timeout. Un conflicto relee lo guardado y exige «Conservar lo guardado» o «Revisar mis respuestas para reenviar»; la segunda opción preserva captura, libera el conflicto y requiere una nueva confirmación del usuario. Sin lectura inicial conocida, encontrar respuestas existentes también exige revisión. Un error de lectura mantiene el estado no confirmado/última lectura, nunca crea un vacío exitoso. Fallo de almacenamiento local bloquea el cierre hasta revisar el borrador; no se declara guardado. La persistencia depende del almacenamiento del dispositivo: borrar los datos del navegador/app elimina borradores locales.

Finish drena primero los borradores existentes de series. Una pre pendiente debe confirmarse antes de congelar la revisión final. Con post seleccionadas o cualquier patch pendiente, usa `finish-with-feelings` con metadata legacy parcial explícita; sin sensaciones elegidas conserva el camino original y energía histórica. Expo integra el cuerpo nuevo en su journal estructural existente y conserva la recuperación de recibo/limpieza local. Tras recibo nuevo confirmado se relee el detalle de sesión para el resumen; si ese read falla, queda recuperable con la misma intención. Web no usa un mero estado «completed» como confirmación de una escritura nueva incierta. No se eliminan intenciones pendientes antes de confirmación durable.

### Validación local y límite contractual

- Raíz: typecheck, ESLint de archivos afectados sin warnings y **77 pruebas**: journal (11), transporte Web (3), render accesible claro/oscuro (3), interacción Web afectada (20), finish legacy (4) y contrato/HTTP del parser extraído (36). Se repite ese grupo de #382 porque se mueve su parser a un módulo portable; no sus suites SQL/advisor ni las de #381.
- Expo: typecheck, lint sin warnings y `config:check` correctos. **148 pruebas únicas en 8 suites focalizadas**: captura/lectura, transporte, finish con journal, controlador/useActiveSession/client existentes y vistas de historial/post afectadas. Ejecutadas en tandas; pruebas de vistas emiten avisos `act` del entorno React, sin fallos. Datos sintéticos y transporte simulado: offline, navegación/reinicio, hora tardía, timeout tras commit, replay, CAS, dos usuarios/sesiones, limpieza parcial y coordinación de finish. No se afirma E2E contra el backend alojado ni QA nativa real. Se reutiliza la evidencia DB/PostgREST de #382; no se aplica SQL ni se repite su auditoría.
- **Brecha demostrada del backend vigente:** `/finish?routineAdditions=1` devuelve el detalle de adiciones a rutina; `/finish-with-feelings` rechaza query params y su respuesta estricta contiene solo contrato/sesión/revisión/valores. Reproducción contractual: finalizar sintéticamente con sensaciones y una adición marcada; las funciones vigentes ejecutan/persisten la adición, pero el DTO nuevo no puede contener `routineAdditions`. Ver `training-feelings-contract.ts`, el handler de `finish-with-feelings` y la migración existente de adiciones a rutina. El cliente no inventa el resultado ni llama a otro finish: confirma la sesión y muestra aviso de detalle no disponible. Recuperar esos badges requiere una extensión **negociada** del backend en otro alcance autorizado, sin romper parsers estrictos. Este PR no la implementa.

### Checklist única pendiente de QA física iOS

- [ ] Claro/oscuro, tamaño de texto grande, VoiceOver y foco: controles 1–5, anclajes, quitar y ausencia de preselección; sin recortes ni colores valorativos.
- [ ] Empezar/finalizar omitiendo todo; seleccionar/quitar energía y fatiga por separado; rendimiento, dolor, notas y energía histórica conservados.
- [ ] Responder pre después de algunas series: hora real de captura; post con significado «cómo terminaste», sin segundo formulario de energía.
- [ ] Sin conexión, elegir respuestas, salir/cerrar/reabrir; volver a conectar y comprobar la misma intención. No mostrar «guardado» antes de confirmar.
- [ ] Simular respuesta perdida tras commit de save/finish; recuperar una sola operación, incluso después de reiniciar y con limpieza local interrumpida.
- [ ] Conflicto desde otro cliente: comparar lo guardado, resolver expresamente, conservar captura al reenviar; nunca sobrescribir automáticamente.
- [ ] Cambiar usuario y volver: sin cruces de respuestas/intenciones entre cuentas/sesiones. Lectura fallida diferenciada de ausencia confirmada.
- [ ] Finish con efectos de rutina y post: confirmar sesión/sensaciones, revisar rutina y el aviso contractual de detalle no disponible; revisar resumen e historial.

Entrega sin mergear. Próximo paso: revisión del borrador, QA física anterior y decisión separada sobre la brecha de detalle de rutina. Sin loader all-time, asociaciones, patrones, scores ni rediseño de Progreso.
