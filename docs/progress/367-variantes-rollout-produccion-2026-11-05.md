# #367 — Rollout de variantes, 2026-11-05

Estado registrado: 2026-11-05T22:45:13.101Z. Autorizado expresamente por el usuario después de revisar el paquete con el nuevo blob.

## Entrega

| PR | Head integrado | Merge en main | Despliegue |
| --- | --- | --- | --- |
| #393 | bac622d01b09e7d9306ef564ce0d1b70f9a8fb74 | d78161379a94f15f125bfa988f205fd17d073fb7 | dpl_4RdJ1hVeSsGY1sA3cU5YdZgSpaoT — READY |
| #394 | fe3fb56a7d48aaf831d0cc5fdc55b8c294e3efeb | 418dbf581059f944e8a55891ef9d667bb1db9fa4 | dpl_U3WuDyRXqJ3cgNWzBjhZFvUJdUcj — READY |
| #395 | 79478fa1e49c45dd047132d695c138a2bc717667 | c5ff1c3a68afcdceb3e7f02410571e83b29424f8 | dpl_8d7jhM5C4vkyzLsNqw7g7U1M9Sd9 — READY |

Merges mediante API de GitHub, con head esperado y sin auto-merge. Cada etapa esperó READY del despliegue anterior. Main final: `c5ff1c3a68afcdceb3e7f02410571e83b29424f8`.

Captura integrada en Web para sesiones en curso y completadas. Código Mobile integrado para ambos recorridos; no se compiló ni instaló Diario. La captura es opcional. No se modificaron series, recibos de finish ni historial previo. Variantes registradas después conservan esa fase; el comparador usa ambas fases como contexto declarado, no como prueba de cuándo se capturó físicamente.

## Migración aplicada

- Plan: `20261106120000_training_exercise_configuration_expand.sql`.
- Versión efectiva de Supabase: `20261105223915_training_exercise_configuration_expand.sql`.
- Blob SQL aprobado y aplicado: `85aaeb254c68bafe2a9834e9d118f415f3075648`.
- Se conservó el historial remoto tal como lo registró Supabase. No se intentó modificarlo.
- Commit `fe3fb56a7d48aaf831d0cc5fdc55b8c294e3efeb`: renombró el archivo y actualizó la ruta del arnés PostgreSQL.
- Commit `79478fa1e49c45dd047132d695c138a2bc717667`: actualizó el paquete y la descripción versionada del EXPAND y el comentario del fixture de PostgREST.
- No cambió SQL ni lógica de aplicación en estos dos commits.
- El árbol final contiene solo el archivo con la versión efectiva, con el mismo blob. El arnés apunta a esa ruta. No volver a aplicar la versión del plan.

## Comprobaciones de producción

Preflight: main `07ee16a`, configuración ausente y última migración `20261105211040`.

Después de aplicar:
- Tabla vacía: sin backfill.
- RLS activa; una política SELECT propia para authenticated.
- authenticated puede leer, sin INSERT/UPDATE/DELETE directos. anon sin lectura ni escritura.
- RPC de lectura (invoker) y de escritura (definer) ejecutables por authenticated, no por anon.
- Helper de normalización no ejecutable por anon ni authenticated.
- Campo recorded_phase presente, definido por el servidor en la RPC.
- Trigger de la tabla activo, diferido e inicialmente diferido.
- Función compartida de fuentes incluye la rama nueva. 9 triggers de fuentes y 1 de segunda pasada.
- 0 notas auxiliares y 0 advisory locks esperando al comprobar.

Lecturas HTTP sin identidad después del último READY:
- GET /api/mobile/v1/training/sessions/00000000-0000-4000-8000-000000000000/exercise-configurations: 401.
- GET /api/mobile/v1/progress/performance-insights: 401.
- OpenAPI público: application/yaml, version 1.4.0, contiene time_stated_by_user.

Los 401 verifican la barrera de autenticación, no el flujo autenticado. No se crearon comidas, variantes, sesiones ni finishes sintéticos en producción, ni se usaron credenciales del usuario para pruebas.

## Advisors y observación breve

Seguridad antes/después:
- 21 → 22 advertencias de SECURITY DEFINER ejecutables por authenticated. La nueva es mutate_training_exercise_configuration_v1, intencional y protegida por identidad/ownership, CAS e idempotencia.
- 4 informativos RLS sin políticas, sin cambio.
- Advertencia previa de protección de contraseñas filtradas, sin cambio.

Referencia: [advertencia de RPC definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Performance:
- FK sin índice e initplan RLS: sin cambios.
- Índices sin uso: 2 → 3, por el índice nuevo de user_id en una tabla recién creada y vacía. Se conserva: no se elimina un índice de ownership para ocultar un aviso inicial.

Vercel: consulta de últimos 30 minutos al cierre sin errores de runtime encontrados.
Postgres: ventana desde 22:39:15 UTC hasta el chequeo de cierre, 0 coincidencias de 40P01/deadlock y 0 de 55P03 entre los 4 eventos disponibles. No acredita carga real ni ausencia general de deadlocks. OBSERVE continúa con uso normal.

## Evidencia reutilizada

Se reutilizó la validación local reportada por Claude y publicada en #394/#395:
- PostgreSQL 17.6.1.105, PostgREST y Auth: 8 pruebas afectadas del contador, 3 guardas y 5 de configuración de punta a punta.
- PostgreSQL 18.6 embebido: 78 aserciones, complementarias.
- Raíz: 1330 pruebas aprobadas y el fallo preexistente informado por CRLF.
- Mobile: tipos, lint y config limpios; 1614 aprobadas y 4 fallos preexistentes.
No se ejecutaron aquí de nuevo esas suites ni campañas. Las verificaciones nuevas de esta sesión son las de rollout, esquema, permisos, versiones, despliegues y observación descritas arriba.

## Pendientes

- [QA física única](367-qa-fisica.md), diferida y no aprobada.
- Build/instalación Mobile solo con autorización futura.
- Refrescar o reimportar cada conexión instalada de ChatGPT para que use el esquema publicado; publicar el esquema no actualiza una copia instalada.
- OBSERVE de errores/esperas de RPC, invalidación y uso de variantes durante/después.
- Convención del sueño, peso corporal en Insights y contexto de todas las sesiones y macros: próximos incrementos, no implementados por este rollout.
- Límites de escala previos siguen pendientes.
- “Consistente” deshabilitado; #367 no se cerró.

## Continuidad

Actualizar main con fetch/pull antes de continuar. No reejecutar la migración antigua ni modificar su historial.
El candidato incorpora main final, conserva sus registros y fixture exclusivos y mantiene previews explícitamente bloqueadas.
