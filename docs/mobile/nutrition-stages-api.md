# Etapas del plan nutricional · EXPAND / paso 2

Implementa el servidor y Mobile API del [plan de Ajustes](../../bocetos/ajustes/PLAN.md), rondas 2 y 3. Las pantallas corresponden al paso 4. La migración `20261016121039_nutrition_plan_stages_expand.sql` se aplicó a producción (Supabase "gym") el 2026-10-16.

## Modelo y fechas

Una etapa sigue siendo `nutrition_plan_periods` más sus siete `nutrition_plan_weekdays`. `stage_kind = null` identifica un plan anterior sin tipo: mostrar «Plan» como tipo genérico, conservando su nombre y sus objetivos reales. No se crean etapas a partir de datos legacy ausentes ni se reemplaza un dato faltante por cero.

`startsOn` es inclusivo y `endsOn` es **exclusivo**: exactamente el `effective_from` del período siguiente del usuario, incluso si pertenece a otra secuencia. La última etapa tiene `endsOn: null`. El resolver diario existente sigue eligiendo el último período vigente; no necesita cron, tareas ni nuevas reglas de activación.

La fecha de negocio es `America/Argentina/Cordoba`. Cada duración admite `{ unit: 'weeks' | 'months', value: integer }`: 1–104 semanas o 1–24 meses. Una semana son siete días de calendario. Cada mes se suma desde la fecha inicial de ese tramo con el intervalo de PostgreSQL, ajustando al último día válido: 31 ene + 1 mes = 28/29 feb; el tramo siguiente parte de esa fecha ajustada. No se convierte «mes» a 30 días ni se mantiene un ancla al día original de la primera etapa. El horizonte máximo de una secuencia es diez años y admite 1–24 tramos; hasta 120 períodos futuros en total por usuario.

Además de `stage_kind`, `sequence_id` y `sequence_position`, se guardan `duration_unit` / `duration_value` como metadatos para editar la programación. No son otra fecha de fin. Las fechas efectivas almacenadas siguen siendo la única entrada del motor diario. La FK `(sequence_id, user_id)` evita vincular etapas a secuencias ajenas.

`after_end: 'keep_last'` no agrega otro período: el último sigue vigente hasta que otro lo reemplace. `after_end: 'maintenance'` agrega un período real con tipo mantenimiento, posición siguiente y duración nula. Sus siete objetivos, agua y extras se reciben explícitamente en `maintenanceStage`; no se copian las calorías del superávit/déficit bajo otro nombre ni se guarda una sugerencia automáticamente. El cliente del paso 4 puede prellenarlos desde una sugerencia y pedir confirmación.

## API

Identidad derivada del Bearer verificado. El cliente no puede enviar `userId`/`user_id`; los parsers TypeScript y SQL rechazan claves desconocidas. Las funciones de escritura son `SECURITY DEFINER` en `ownlevel_private`, con wrappers `SECURITY INVOKER` en `public`. Los helpers de escritura no tienen permiso de ejecución para `authenticated`; el único acceso mutante es la función con CAS e idempotencia.

`GET /api/mobile/v1/nutrition/stages` devuelve `NutritionStages` del [contrato compartido](../../src/lib/mobile-api/nutrition-stages-contract.ts):

- `today`, `listVersion`, `current | null`, `upcoming`, `past`, `sequences`, `suggestions | null`.
- Etapa: id, nombre, tipo nullable, `startsOn`, `endsOn` nullable, siete días ISO 1–7, agua, extras, secuencia/posición nullable, duración nullable y estado `past | current | upcoming`.
- Futuras por inicio ascendente; hasta las últimas 24 pasadas por inicio descendente; desempate por id. El fin se calcula **antes** del límite histórico. No se truncan las futuras.
- Secuencias referenciadas por las etapas devueltas, ordenadas por creación e id. Su `afterEnd` conserva la elección original: cortar la cola no reescribe la historia de la secuencia. Una secuencia sin períodos visibles no aparece en esta lectura.

`POST` recibe un intent estricto con estos campos comunes:

```ts
{ operation, date: today, expectedListVersion, idempotencyKey, ... }
```

`date` evita que un formulario abierto ayer termine cambiando otro día. Las claves duran igual que los recibos de configuración existentes y no se reciclan; una confirmación puede recuperarse con el mismo intent aunque cambie el día o la lista.

| Operación | Campos adicionales | Efecto |
| --- | --- | --- |
| `replace_from_today` | `stage`, `future_stages: 'keep' \| 'cancel'` | Upsert de hoy y refresh exclusivamente de hoy si existe. Detacha hoy de cualquier secuencia. Mantiene o elimina **explícitamente** los períodos futuros. |
| `schedule_sequence` | `name`, `after_end`, `start_date`, `stages: (StageFields & {duration})[]`, `maintenanceStage: StageFields \| null` | Calcula fechas y crea todos los tramos atómicamente. Puede empezar hoy, reemplazando solo el período de hoy. Una fecha anterior a hoy o etapas existentes desde el inicio se rechazan; no hay reemplazos silenciosos. |
| `update_future` | `stageId`, `stage`, `startsOn`, `duration` | Solo un período que no empezó, y nuevo inicio > hoy. Cambiar inicio/duración vuelve a encadenar la cola futura de **esa** secuencia; conserva los ids de períodos. No cruza otras etapas, no adelanta sobre la anterior ni cambia tramos ya iniciados. |
| `delete_future` | `stageId` | Solo futura. **Borrar en el medio falla** con un aviso que propone borrar desde la última o cortar la secuencia; no corre fechas de forma implícita. La anterior queda vigente hasta la próxima frontera existente, o indefinidamente. |
| `cancel_sequence` | `sequenceId` | Borra solo sus períodos con inicio > hoy. Conserva el actual y todos los pasados; la etapa que queda vigente continúa hasta otro cambio. |

`StageFields` contiene `name`, `kind`, `baseWaterL`, `trainingCalorieDeltaKcal`, `trainingWaterDeltaL`, `weekdays[7]` con `weekday`, `calorieTargetKcal` y `proteinTargetG`. Usa los rangos y precisión de la configuración actual; nombre de hasta 80 caracteres. `duration` es nula para un período fuera de secuencia o el mantenimiento final; una edición conserva esa distinción.

Respuestas:

- 200: `{ status: 'confirmed', operation, date, list }`.
- 409: `{ status: 'conflict', error, message, list }`, con la verdad del servidor. `STAGES_CHANGED`, `STAGES_DAY_CHANGED` o `IDEMPOTENCY_KEY_REUSED`.
- 400: `{ status: 'validation', message }`, en castellano. No hubo cambio parcial.
- 401: autenticación requerida. 503: resultado no confirmado/no disponible; nunca se traduce a una lista vacía ni habilita un reintento ciego.

Todas las respuestas son `no-store`. Todas las escrituras usan `mobile_idempotency_keys`, namespace `nutrition.stages.v1`, hash del intent normalizado y recibo persistido. Repetir exactamente un intent devuelve su recibo original, incluida su lista original; para obtener cambios posteriores se hace GET. Reusar la clave con otros datos devuelve conflicto sin modificar el primer recibo.

## Concurrencia y compatibilidad

Orden de bloqueo compartido con la configuración existente: advisory 412 del usuario → advisory 413 del usuario → filas. Los triggers actuales de períodos/días de semana toman 413 antes de modificar filas. Triggers aditivos incrementan la versión de lista al escribir períodos, días de semana o secuencias, incluyendo guardados de Web y de `operation: 'plan'`. `listVersion` es un entero seguro creciente, no un contador de operaciones: una escritura puede incrementarlo varias veces.

`save_nutrition_plan_v2` conserva firma, validación, upsert del período de **hoy**, siete días y refresh del día actual. El único ajuste es limpiar las columnas nuevas al hacer upsert sobre una etapa tipada: un guardado del editor anterior vuelve a ser un plan sin tipo/secuencia. Conserva los futuros, como antes. No cambia las reglas de energía ni el motor diario.

La migración agrega campos al objeto de período que usa la configuración actual para calcular su fingerprint. Un formulario que quedó abierto antes del EXPAND puede recibir un conflicto normal al guardar y requerir releer. No se cambia su contrato ni se descarta el borrador.

No hay DDL sobre `day_logs`, actualización de snapshots pasados ni reasignación de sus `nutrition_plan_period_id`. La FK histórica existente sigue siendo `ON DELETE RESTRICT`. Una futura que ya tenga un día materializado no puede moverse ni eliminarse: rechaza la operación completa, también al cancelar una secuencia o todos los futuros. Riesgo deliberado y existente: cambiar varias veces **hoy** actualiza el mismo período de hoy y su snapshot, como el editor actual; mañana ese período deja de ser editable por esta API.

## Sugerencias

El GET consulta el gasto estimado real de hoy mediante el resolver existente. Si falta, devuelve `suggestions: null`. Mantenimiento = 100 %, déficit = 90 % y superávit = 105 %, redondeados a kcal enteras. Recomposición y tipo propio quedan sin sugerencia automática. Son porcentajes orientativos conservadores de producto, no una prescripción individual; no se sugieren proteína, agua o extras sin una decisión del usuario. Una lectura nunca guarda objetivos.

## Verificación local y rollout

Tests de contrato/API en Vitest; integración con PostgreSQL descartable cargando las migraciones reales de nutrición, el motor, RLS y la configuración actual:

```sh
OWNLEVEL_TEST_MODULES=/path/to/tooling/node_modules npm test -- nutrition-stages nutrition-config
```

El tooling externo es el mismo `embedded-postgres` utilizado por `scripts/testing/m4-3-1-configuration.mjs`; sin la variable, solo la integración PostgreSQL se marca omitida. La prueba nunca usa credenciales ni una base remota. El script emite cada grupo comprobado y el contrato se valida también contra un snapshot real. Para Expo: `npm run validate` desde `apps/mobile`.

EXPAND: revisar y aplicar manualmente la migración; desplegar API; observar compatibilidad de Web/configuración actual. ADOPT: construir las pantallas del paso 4 sobre estos contratos. Este paso no habilita pantallas ni comparación por etapa en Progreso.
