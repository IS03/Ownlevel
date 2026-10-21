Progreso · "Lo que se movió junto" · paso 1: lectura del servidor y contrato

Contexto
- Repo OWNLEVEL. Leé AGENTS.md.
- Plan: `bocetos/conexiones/PLAN.md`. Bocetos: `bocetos/conexiones/` (C1–C4); miralos para entender qué muestra cada historia.
- Ya existen en main:
  - las lecturas de Progreso (`src/lib/mobile-api/progress-server.ts`, `progress-training.ts`, `progress-explore.ts`, `progress-stages.ts`, `progress-influence.ts`);
  - sus contratos en `src/lib/mobile-api/*-contract.ts`.
- Reusá esas lecturas, sus cálculos y su estilo. No inventes otra forma de leer datos.
- Rama nueva desde main: `codex/m9-progress-connections-read`.
- Este paso NO toca la app: solo `src/lib/mobile-api`, `src/app/api/mobile/v1/progress` y tests.

Objetivo
Una lectura que compara el período elegido (A) con otro (B, en la práctica el anterior equivalente). Cuenta cuatro historias que juntan algo de comida con algo de cuerpo o rendimiento. Devuelve hechos con números y cobertura, no textos armados: la app escribe la frase.

1) `GET /api/mobile/v1/progress/connections`
- Parámetros:
  - los de siempre de Progreso: `period`, `from`/`to` y `compareFrom`/`compareTo`, con `progressQueryFromParams`;
  - acá `compareFrom`/`compareTo` son **obligatorios**: sin B no hay historia. Si faltan, 400 con mensaje claro;
  - cualquier otro parámetro, 400.
- Respuesta (`ProgressConnections`):
  - `today`, `period` (A), `reference` (el período B, con el mismo formato que `period`);
  - `stories`: siempre las cuatro claves, en este orden fijo:
    `protein_strength`, `carbs_strength`, `carbs_energy`, `kcal_weight`.
- Cada historia:
  - `key`;
  - `status: "ready" | "insufficient" | "unavailable"`;
  - `food`: `{ key: "nutrition.protein" | "nutrition.carbs" | "nutrition.kcal", unit, current, previous, coverage: { current: {days, eligible}, previous: {days, eligible} } }`. `current` y `previous` son promedios, o `null` si no alcanza;
  - `outcome`: depende de la historia (ver 2);
  - `missing`: `null` cuando está `ready`. Si no, `{ side: "food" | "outcome", reason, have, need, period: "current" | "previous" }`, para que la app diga "Hacen falta 3 pesajes en cada período. Esta semana tenés 1."
  - `reason`: `food_days` | `weigh_ins` | `comparable_exercises` | `energy_sessions`.
  - `unavailable` es solo cuando la fuente falló al leerse; es distinto de `insufficient`, que significa que faltan datos (missing != zero, empty != unavailable). Si una fuente falla, las historias que dependen de ella van `unavailable` y las demás se responden igual.
- Detalle, para la pantalla del paso 3:
  - `weeks`: semanas lunes a domingo que tocan A, recortadas a A, cada una con `{ start, end, food: number | null, days, eligible }`. Igual para B en `weeksPrevious`;
  - en historias de fuerza, `exercises`: los ejercicios comparables;
  - en `kcal_weight`, el peso por semana: `{ start, end, trend: number | null }`.
- `ranking`: el orden sugerido para mostrar las `ready`, de mayor a menor cambio relativo en las dos puntas (por ejemplo, la suma de |Δ%| de food y de outcome). Las `insufficient` y `unavailable` no entran.

2) Cómo se calcula (todo en el servidor, puro y testeable)
- **Comida** (proteína, carbos, kcal):
  - Promedio por día **solo de los días con comidas registradas**, con la misma regla de "día con registro" que usan explore y la overview de nutrición. Reusá esa función, no la copies.
  - Hoy en curso no entra en el promedio (misma regla de explore).
  - Mínimo: comidas en al menos 4 de 7 días por semana. En períodos de más de 2 semanas, en al menos la mitad de los días elegibles. Se exige en A y en B; si no, `insufficient` con `reason: "food_days"`.
  - Un día sin comidas NO es 0: no entra en el promedio ni en `days`.
- **Fuerza** (`protein_strength`, `carbs_strength`):
  - Reusá el estado por ejercicio que ya calcula la lectura de entrenamiento con comparación (`improved | stable | declined | insufficient_data`).
  - Ejercicio comparable = repetido en A y en B con estrategia de carga en kg.
  - Para cada comparable devolvé `{ exerciseId, name, previousE1rm, currentE1rm, status }`. El 1RM estimado es Epley con series de 1 a 12 reps, redondeado a 0,5 kg, igual que hoy en `progress-training.ts`, y siempre es "estimado".
  - `outcome` = `{ kind: "strength", improved, comparable, top: { exerciseId, name, previousE1rm, currentE1rm } | null }`. `top` es el comparable con mayor cambio absoluto de 1RM estimado.
  - Mínimo: al menos 1 ejercicio comparable. Si no, `insufficient` con `reason: "comparable_exercises"`.
- **Energía** (`carbs_energy`):
  - Promedio de `training_sessions.energy_level` (1–5) de las sesiones completadas y no descartadas de cada período. La lectura de entrenamiento ya lo junta como "feeling" `energy`; reusalo.
  - `outcome` = `{ kind: "energy", current, previous, scaleMaximum: 5, sessions: { current, previous } }`.
  - Mínimo: 2 sesiones con energía cargada en cada período. Si no, `insufficient` con `reason: "energy_sessions"`.
- **Peso** (`kcal_weight`):
  - Tendencia con la misma regla de `progress-stages` (`weightPerWeek`, mínimos cuadrados).
  - `outcome` = `{ kind: "weight", current, previous, perWeekCurrent, perWeekPrevious, weighIns: { current, previous } }`. `current` y `previous` son el valor de la tendencia al final de cada período, no el último pesaje suelto.
  - Mínimo: 3 pesajes en al menos 10 días en cada período (la misma regla de etapas). Si no, `insufficient` con `reason: "weigh_ins"`.
- **Una sola lectura por fuente** para las cuatro historias: entrenamiento, hechos de nutrición y peso se leen una vez y se reparten.
- **Rango de lectura:** A ∪ B, nunca después de hoy.

3) Contrato (`src/lib/mobile-api/progress-connections-contract.ts`)
- Tipos y un parser estricto que rechaza:
  - claves de historia desconocidas, repetidas o fuera de orden;
  - `ready` con `missing` distinto de `null`, o con `food.current`/`previous` en `null`;
  - `insufficient` sin `missing`;
  - `unavailable` con valores;
  - coberturas con `days > eligible`;
  - `energy` fuera de 1–5;
  - semanas fuera de su período;
  - `ranking` con claves que no están `ready`.
- Lo importa también la app (paso 2): sin imports de servidor.

4) Ruta
- `src/app/api/mobile/v1/progress/connections/route.ts`, con `progressReadResponse` (identidad por Bearer, reintento a medianoche, validación del DTO con el parser antes de responder).
- Sin `service_role`. Sin migraciones. Agregá el builder y la respuesta en `progress-server.ts` como las otras lecturas (`progressConnectionsResponse`).

Tests (`src/lib/mobile-api/progress-connections.test.ts`)
- Comida: un día sin comidas no baja el promedio; con 3 de 7 días va `insufficient` (`food_days`) y `have`/`need` son correctos.
- Fuerza: un ejercicio solo en A no es comparable; `improved`/`comparable` y `top` son correctos; el 1RM respeta 1–12 reps y el redondeo a 0,5.
- Energía: con 1 sesión con energía en B va `insufficient` (`energy_sessions`); las sesiones descartadas no cuentan.
- Peso: con 2 pesajes va `insufficient` (`weigh_ins`); la tendencia sale de mínimos cuadrados.
- Fuente caída: si falla la lectura de peso, `kcal_weight` va `unavailable` y las otras se responden.
- `ranking` solo con `ready` y en el orden esperado.
- Sin `compareFrom`/`compareTo` o con un parámetro desconocido: 400.
- El parser rechaza los casos del punto 3.

Validación
- Desde la raíz: `npx tsc --noEmit -p .`, `npx vitest run src/lib/mobile-api` y eslint de los archivos tocados.
- Desde `apps/mobile`: `npm run typecheck`, porque el contrato también lo importa la app.
- La raíz tiene 2 tests y 2 errores de lint que ya fallaban antes; no los arregles en este PR, pero no sumes nuevos.

Entrega
- Commit, push y PR a main.
- En la descripción del PR:
  - el EXPAND: un endpoint nuevo, sin migración, nada existente cambia;
  - las reglas de mínimos de cada historia;
  - que la app todavía no lo usa (paso 2).
- No hagas merge.
- No toques `apps/mobile/.env.local`.
