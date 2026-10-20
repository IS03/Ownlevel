# Extra por entrenar: calorías y proteína; el agua sale del plan · EXPAND

Migración: `supabase/migrations/20261020013939_nutrition_training_protein_expand.sql`. Amplía [Etapas](nutrition-stages-api.md).
Se probó en Postgres descartable y se aplicó a producción (Supabase "gym") el 2026-10-19, antes del merge, después de comprobar que las seis funciones reemplazadas eran idénticas a las del repo. Las 15 funciones resultantes coinciden con las de la prueba local. La API se despliega al mergear.

## Decisión de producto

- "Si entrenás" suma solo a los objetivos nutricionales que el plan tiene: calorías y, desde ahora, proteína. Un objetivo que falta sigue faltando: el extra nunca lo inventa.
- El agua es una métrica (Agua) con su propio objetivo. Una etapa puede no tener agua propia (`baseWaterL: null`). En ese caso su extra de agua es 0, y el objetivo de agua del día sale de la métrica Agua activa. Fuera del rango del snapshot (0 a 50 L) queda sin objetivo, nunca recortado.
- Los planes y etapas que ya tienen agua propia conservan exactamente el cálculo anterior.

## Modelo

- `nutrition_plan_periods.training_protein_delta_g numeric(6,2) not null default 0`, entre 0 y 1000.
- `base_water_l` pasa a aceptar null. null significa "sin agua propia" y nunca se lee como 0.
- `resolve_nutrition_context` es la misma función que en `20260909180000`, con dos cambios. La proteína del día suma el extra al entrenar (si falta el objetivo de proteína, sigue faltando). Y un plan sin agua propia toma el objetivo de la métrica Agua. Los días pasados ya resueltos siguen devolviendo sus snapshots sin cambios.

## Compatibilidad: forma v2 opcional

- `GET/POST /api/mobile/v1/nutrition/stages` sin parámetros conserva exactamente la forma v1 en lecturas, intents, recibos y ledger (`nutrition.stages.v1`).
- Con `?targets=2`, cada etapa suma `trainingProteinDeltaG`, y `baseWaterL` puede ser null, en cuyo caso `trainingWaterDeltaL` debe ser 0. Usa los RPC `mobile_read_nutrition_stages_v2` y `mobile_mutate_nutrition_stages_v2`, que son invoker públicos con la lógica privada de siempre, y su propio ledger, `nutrition.stages.v2`. Las dos formas son exactas: una forma mezclada se rechaza antes de escribir.
- Un intent v1 no conoce el extra de proteína y conserva el guardado. Una etapa nueva creada en v1 lo deja en 0.
- Un lector v1 que encuentre una etapa sin agua propia ve `baseWaterL: null`. El parser v1 rechaza la lista: el cliente queda en "no disponible", nunca muestra un 0 falso. Progreso, del lado del servidor, ya lee la v2.
- `save_nutrition_plan_v2` (editor Web anterior) no cambia: conserva el extra de proteína guardado y sigue pidiendo agua.
- La configuración (`/nutrition/config`) ya aceptaba `baseWaterL: null` y ahora lo devuelve así en lugar de 0.

## Verificación local

- `OWNLEVEL_TEST_MODULES=/ruta/externa/node_modules node scripts/testing/nutrition-stages.mjs`: aplica la migración real sobre las de etapas. Los 19 grupos v1 se mantienen y hay 4 nuevos:
  - v2 opcional;
  - extra de proteína y agua de la métrica (con y sin entrenamiento, y fuera de rango);
  - un guardado v1 conserva el extra;
  - formas mezcladas rechazadas y ledgers separados.
- Vitest: `nutrition-stages`, `progress-stages`, `nutrition-config` y `nutrition`.

## Rollout

EXPAND (este paso): aplicar la migración, desplegar la API y observar. ADOPT: Mobile pide `?targets=2`, quita el agua del editor de etapas y muestra "Si entrenás" solo para los objetivos que el plan tiene. CONTRACT: más adelante, cuando ya no queden clientes v1.
