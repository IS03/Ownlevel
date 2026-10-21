Progreso · etapa 3 · paso 1: lectura "Qué influye" (solo servidor y contrato)

Contexto
- Repo OWNLEVEL. Leé AGENTS.md. Plan: bocetos/que-influye/PLAN.md. Bocetos: bocetos/que-influye/ (T1–T6).
- La etapa 2 ya está en main:
  - `GET /api/mobile/v1/progress/explore`, en `src/lib/mobile-api/progress-explore.ts` y `progress-explore-contract.ts`;
  - Mis vistas.
- Reusá esas lecturas y su estilo. No inventes otra forma de leer datos.
- Rama nueva desde main: `codex/m9-progress-influence-read`.
- Este paso NO toca la app (solo `src/lib/mobile-api`, `src/app/api/mobile/v1/progress` y tests).

Objetivo
Una lectura que compara dos grupos de días del período elegido: los separa por una medida y mira otra medida el mismo día o días después.

1) `GET /api/mobile/v1/progress/influence`
- Parámetros:
  - los de siempre de Progreso: `period`, `from`/`to`, `compareFrom`/`compareTo` (con `progressQueryFromParams`);
  - `split` (obligatorio): medida que separa los días;
  - `cut` (obligatorio):
    - `median`;
    - `gte:<número>` (corte propio, por ejemplo `gte:300`);
    - `yes` (solo para medidas sí/no);
  - `lag` (obligatorio): `0`, `1` o `2`. Es el día de la medida respecto del día que separa;
  - `outcome` (obligatorio): medida que se mira.
- Medidas que separan (`split`):
  - `nutrition.kcal|protein|carbs|fat`: valor del día completo con registro, igual que explore;
  - `metric.<uuid>`: valor del día; un 0 registrado cuenta;
  - `training.sets|sessions|minutes`: suma del día, 0 si no entrenó;
  - `day.training`: sí/no, día con sesión completada;
  - `day.work`: sí/no, `work_effective_snapshot`; si falta, el día no entra.
- Medidas que se miran (`outcome`):
  - nutrición y métricas, igual que arriba;
  - entrenamiento solo en días con sesión completada ("sobre días que entrenaste"). Un día sin entrenar NO es 0 acá.
  - Nada de cuerpo ni ejercicios en este paso.
- Combinaciones inválidas = 400 con mensaje claro:
  - `cut=yes` con medida numérica, o `median`/`gte` con sí/no;
  - `split` igual a `outcome` con `lag=0`;
  - medidas desconocidas;
  - lag fuera de 0–2.

2) Cómo se calcula (todo en el servidor, puro y testeable)
- Pares: para cada día D del período con valor de `split`, el valor de `outcome` en D+lag.
  - D+lag puede caer fuera del período (por ejemplo, el día siguiente al último). En ese caso se lee igual: la lectura cubre el período más `lag` días, pero nunca pasa de hoy.
  - Solo entran pares con los dos datos. Hoy en curso no entra como día de `outcome` promedio (misma regla de explore).
- Corte:
  - `median`: mediana de los valores de `split` en los pares. Grupo "alto" = valor ≥ mediana.
  - `gte:x`: alto = ≥ x.
  - `yes`: alto = sí.
- Mínimos: 14 pares en total y 5 en cada grupo. Si no se cumplen:
  - `status: "insufficient"`, con `pairs`, `needed` (14), `perGroupNeeded` (5), los días de cada grupo, y qué dato falta más (`missing: "split" | "outcome"`, el que tiene menos días con dato en el período).
  - NO devuelvas promedios de los grupos.
- Si alcanza: `status: "ok"`, con:
  - promedio de `outcome` en cada grupo;
  - días de cada grupo;
  - diferencia absoluta (alto − bajo);
  - diferencia en % sobre el grupo bajo, `null` si el bajo es 0;
  - el corte usado (valor de la mediana, o x).
- Evidencia (`low | moderate | clear`), con Welch t sobre los dos grupos:
  - `clear` si |t| ≥ 2,5 y pares ≥ 30;
  - `moderate` si |t| ≥ 1,5;
  - si no, `low`.
  - Si los dos grupos tienen varianza 0 y la misma media, `low`.
  - Documentá la regla en un comentario y no expongas t ni p.
- Comparación: con `compareFrom`/`compareTo`, `reference` trae lo mismo para ese rango (status, grupos, evidencia). Sin comparar, `reference: null`.

3) `GET /api/mobile/v1/progress/influence/suggested`
- Mismos parámetros de período y comparación. Devuelve el resultado de las preguntas listas de T1, cada una con su definición (`split`, `cut`, `lag`, `outcome`) y una `key` estable. Las preguntas:
  1. `sleep_sets`: métrica de sistema `sleep`, mediana, lag 1 → `training.sets`;
  2. `carbs_sets`: `nutrition.carbs`, mediana, lag 1 → `training.sets`;
  3. `training_kcal`: `day.training`, yes, lag 0 → `nutrition.kcal`;
  4. `steps_sleep`: métrica `steps`, mediana, lag 0 → métrica `sleep`;
  5. `training_water`: `day.training`, yes, lag 0 → métrica `water`.
- Las métricas de sistema se buscan por `system_key` (`SYSTEM_METRIC_KEYS` en `src/lib/daily-metrics/core.ts`). Si el usuario no la tiene activa, esa pregunta no aparece.
- Una sola lectura por fuente para todas las preguntas: entrenamiento, hechos de nutrición y valores de métricas se leen una vez y se reparten.

4) Contrato (`src/lib/mobile-api/progress-influence-contract.ts`)
- Tipos, catálogo de medidas válidas para `split` y `outcome`, y un parser estricto para las dos respuestas. El parser rechaza:
  - `ok` con grupos de menos de 5 días;
  - `insufficient` con promedios;
  - evidencia fuera de los tres valores;
  - fechas fuera del período.
- La respuesta incluye `measure` de split y outcome con `label`, `unit` y `valueType`, para que la app arme la frase.
- Usá `progressReadResponse` (identidad por Bearer, reintento a medianoche, validación del DTO antes de responder). Sin `service_role`. Sin migraciones.

Tests (`src/lib/mobile-api/progress-influence.test.ts`)
- Lag 1 empareja D con D+1, incluido el día siguiente al último del período (sin pasar de hoy).
- Mediana con empates: los iguales a la mediana van al grupo alto.
- Entrenamiento como outcome ignora los días sin sesión; como split, cuenta 0.
- `day.work` sin dato no entra en ningún grupo.
- 13 pares → `insufficient` sin promedios, y `missing` correcto.
- Evidencia: un caso `clear`, uno `moderate` y uno `low`.
- `reference` solo comparando.
- `suggested` omite la pregunta si no hay métrica de sueño activa.
- Parámetros inválidos = 400.

Validación
- Desde la raíz: `npx tsc --noEmit -p .`, `npx vitest run src/lib/mobile-api` y eslint de los archivos tocados.
- Desde apps/mobile: `npm run typecheck`, porque el contrato también lo importa la app.

Entrega
- Commit, push y PR a main.
- En la descripción del PR:
  - el EXPAND (dos endpoints nuevos, sin migración, nada existente cambia);
  - las reglas de mínimos y evidencia;
  - que la app todavía no los usa (paso 2).
- No hagas merge.
- No toques `apps/mobile/.env.local`. Si necesitás un servidor local para probar, usá una variable de entorno al lanzar Metro, nunca ese archivo.
