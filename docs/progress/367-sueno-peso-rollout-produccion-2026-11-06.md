# #367 — Rollout de sueño y peso corporal

Cierre registrado: 2026-11-06T13:05:27.776Z. Rollout autorizado expresamente por el usuario.

## Producción

| PR | Merge en main | Despliegue |
| --- | --- | --- |
| #397 — EXPAND | 4268048da9a7f5c37e426539bd7119a6b60dc9d0 | dpl_9VuD7GHB6AjNnxpu1HoCBFLFDrUT — READY |
| #398 — ADOPT | 71c7dd3c1240fb221486190a0ebb65bd6a80f22b | dpl_5o8s8LcXQpiFCJWF4H52nMLwxgzx — READY |

Cada merge se ejecutó con el head esperado, sin auto-merge. ADOPT esperó READY del EXPAND.
Main final: `71c7dd3c1240fb221486190a0ebb65bd6a80f22b`.

## Migración

- Versión del plan: 20261107120000.
- Versión efectiva: `20261106024523_sleep_night_and_body_weight_sources_expand.sql`.
- Blob aplicado: `39644f101e44ac25b303278392523cb4456e928d`.
- La revisión completó la cabecera de reversión con el DROP de declare_sleep_nights_written. Solo cambió un comentario frente al blob de validación local; el SQL ejecutable se comparó y era idéntico.
- Git se alineó con el timestamp asignado por Supabase, conservando el blob y sin modificar el historial remoto. Commit de alineación: `2ac82fa032d52face7c08f15259776c74c64e9a9`.
- El árbol final solo tiene la migración con la versión efectiva. No volver a aplicar la versión del plan.

## Qué se habilitó

Sueño: los clientes nuevos muestran qué noche corresponde a la fecha y la declaran junto con el guardado. La declaración está atada al valor, fecha y updated_at. Historial sin backfill; ediciones por clientes viejos invalidan la declaración; borrado en cascada.

Peso corporal: reutiliza day_logs.weight_kg como contexto diario, sin afirmar si se midió antes de entrenar y sin multiplicarlo por la cantidad de sesiones.

Insights: método 2 opcional mediante ?method=2; los clientes que no lo piden conservan /1. Cachés separadas. Mobile pide /2, pero ese código llega al teléfono con una build futura. Captura Web desplegada. Corregir peso o declaraciones invalida las fuentes.

## Comprobaciones

Producción, lecturas de esquema y permisos:
- Tabla de convenciones creada, inicialmente vacía: sin backfill.
- RLS y política SELECT propia.
- authenticated sin escritura directa; anon sin lectura ni escritura.
- Cuatro funciones ejecutables por authenticated, no por anon: una definer y tres invoker.
- Triggers de declaración y de aparición/cambio/borrado de peso activos y diferidos.
- Sin notas auxiliares ni advisory locks esperando en la verificación.
- Historial de migraciones volvió a consultarse antes de integrar consumidores.

Tras el último READY:
- GET de Insights por defecto sin identidad: 401.
- GET con method=2 sin identidad: 401.
Esto solo comprueba autenticación; no acredita lecturas autenticadas ni el guardado con la cuenta real. No se hicieron escrituras sintéticas en producción.

Vercel: consulta de últimos 30 minutos sin errores de runtime encontrados.
Postgres: ventana desde 2026-11-06T13:01:39.150Z hasta el chequeo de cierre, 0 coincidencias de 40P01/deadlock y 0 de 55P03 entre los 2 eventos disponibles. No prueba carga ni ausencia general de deadlocks.

## Advisors

Seguridad: 22 → 23 advertencias de SECURITY DEFINER ejecutable por authenticated. La nueva es declare_sleep_night_v1 y es intencional: identidad, ownership y CAS. Se mantienen los 4 informativos RLS sin políticas y la advertencia previa de contraseñas filtradas.

[Referencia del advisor de funciones definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Performance: 1 FK sin índice y 1 initplan RLS sin cambios; índices sin uso 3 → 4 por el nuevo índice de user_id en la tabla recién creada. No se eliminó para ocultar el aviso.

## Evidencia reutilizada y límites

Se reutilizó la evidencia publicada por el ejecutor: 9 pruebas afectadas del contador, 3 guardas y 4 de punta a punta en PostgreSQL 17.6/PostgREST/Auth; tipos y pruebas de Web/Mobile con fallos preexistentes documentados. No se repitieron aquí suites ni campañas.

La campaña dirigida publicada (400 historias por escenario y tamaño de familia) encontró, con tendencia compartida, 1,0 % en la compuerta estricta y límite superior 95 % de 2,5 %. No acredita el objetivo del 1 % ni una garantía anual. Lo exploratorio puede aparecer por tendencias compartidas: conserva su advertencia. El método parcial sigue publicando coincidencias con contexto desconocido. “Consistente” permanece deshabilitado. Sin afirmaciones causales ni recomendaciones automáticas.

## Pendientes

- OBSERVE con uso normal: errores de envoltorios, 503, esperas e invalidación.
- Build e instalación Mobile pendientes de autorización.
- [QA física única](367-qa-fisica.md), diferida y no aprobada.
- Todas las sesiones y los cuatro macros en el contexto del día, y tendencias de peso: no implementados.
- Límites de escala anteriores siguen pendientes; las mediciones locales de estas fuentes no son latencia de producción.
- #367 continúa abierto.

## Continuidad

Actualizar main antes de continuar. No reejecutar migraciones antiguas. Las descripciones de #397 y #398 ya reflejan la aplicación.
El candidato incorpora este main y preserva sus registros y la prueba exclusivos de integración. Sus previews siguen bloqueadas.
