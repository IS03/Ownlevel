Progreso · etapa 3 · paso 3: fijar una pregunta de Qué influye en Mis vistas

Contexto
- Repo OWNLEVEL. Leé AGENTS.md. Plan: bocetos/que-influye/PLAN.md (paso 3). Boceto: bocetos/que-influye/02-T2-respuesta.png ("Fijar en Mis vistas").
- Ya están en main:
  - Mis vistas: tabla `public.progress_views`, funciones `mobile_*_progress_view*`, contrato `src/lib/mobile-api/progress-views-contract.ts`, servidor `progress-views-server.ts`; app en `my-views.tsx`, `pin-view-sheet.tsx` y `views-edit-screen.tsx`;
  - Qué influye: contrato `progress-influence-contract.ts`, servidor `progress-influence.ts`; app en `influence-*`.
- Rama nueva desde main: `codex/m9-influence-views`.
- NO toques `apps/mobile/.env.local`.

Objetivo
Poder fijar una respuesta de Qué influye en Mis vistas, igual que una consulta de Explorar. Sin migración.

1. Definición de vista
- Hoy una vista es `{ measure, breakdown, days, series }` (Explorar).
- Sumá una segunda forma: `{ kind: "influence", measure: <outcome>, split, cut, lag }`.
  - `measure` repite el `outcome` a propósito: la tabla exige `definition->'measure'` string (check de la migración `20261015175527`), y así no hace falta migrar.
  - Las vistas viejas no tienen `kind` y siguen siendo de Explorar.
- En el contrato de vistas:
  - `ProgressViewDefinition` pasa a ser una unión;
  - `parseViewDefinition` acepta las dos formas. La de influence se valida con `validInfluenceDefinition` del contrato de Qué influye, y `measure` tiene que ser igual a `outcome`.
- Helpers chicos `isInfluenceView(d)` y `influenceDefinitionOf(d)`.
- El tope de 1 KB y de 6 vistas sigue igual (lo hace la base).

2. Lectura (EXPAND cuidadoso)
- `GET /api/mobile/v1/progress/views` acepta un parámetro nuevo `kinds=influence`.
  - Sin ese parámetro, las vistas de influence NO se devuelven, así las apps viejas (que no las conocen) siguen leyendo bien.
  - El `listVersion` y las posiciones de las vistas que sí se devuelven no cambian.
  - Documentalo en un comentario.
  - Validá el parámetro: solo `influence`, sin repetidos.
- Con `kinds=influence`, cada vista de influence trae su resultado con `buildMobileProgressInfluence` en el período compartido:
  - `result: { status: "ok", kind: "influence", data }`;
  - o `unavailable` con la misma regla de hoy: una métrica que ya no existe es `invalid_definition`, y una lectura caída es `data_unavailable`.
- Las de Explorar quedan igual. Si hace falta, sumá `kind: "explore"` en su `result`, SOLO cuando se pidió `kinds=influence`. La respuesta sin el parámetro tiene que quedar idéntica.
- El parser de la lectura acepta las dos formas.

3. Escritura
- `POST /progress/views` acepta la definición de influence (validada como arriba antes de llegar a la base).
- Renombrar, sacar y ordenar no cambian.
- Ojo con ordenar: si una app vieja no ve las vistas de influence y manda un orden, la base lo rechaza con `PROGRESS_VIEW_LIST_CHANGED`, porque la lista no coincide. Es el comportamiento correcto (nunca se pisa nada); dejalo documentado.

4. App
- `fetchProgressViews` manda `kinds=influence`.
- `my-views.tsx`: una vista de influence muestra:
  - su nombre;
  - como número, la diferencia ("5 series más" o "655 kcal menos");
  - debajo, la respuesta corta (`shortAnswer` de `influence-model.ts`);
  - con `insufficient`: "Faltan datos: N de 14 días", sin números.
  - Tocarla abre la respuesta (`/(tabs)/progress/influence/answer`) con su definición.
- T2 (`influence-answer-screen.tsx`):
  - debajo de las filas, "Fijar en Mis vistas" (fila champagne con `pin`, como el boceto);
  - abre la hoja de `pin-view-sheet.tsx`, generalizada para recibir cualquier definición y un nombre sugerido;
  - nombre sugerido: el título de la pregunta, recortado a 60 caracteres;
  - después de fijar: "Fijada en Mis vistas", igual que en Explorar;
  - con `insufficient` también se puede fijar (la vista va a mostrar "Faltan datos").
- `views-edit-screen.tsx`: el detalle de una vista de influence es "Qué influye · <split> → <outcome>".

5. Tests
- Contrato:
  - acepta influence válida;
  - rechaza `measure` distinto de `outcome`, `cut=yes` con medida numérica y lag 3.
- Servidor:
  - sin `kinds` no devuelve vistas de influence y la respuesta queda igual que antes;
  - con `kinds=influence` las devuelve con su resultado;
  - una métrica borrada da `invalid_definition` sin tapar a las demás;
  - `kinds=otra` = 400.
- App:
  - una vista de influence en Mis vistas (ok e insufficient);
  - tocarla navega a la respuesta;
  - fijar desde T2 manda la definición correcta con una clave por intento.
- Prueba contra la base, si podés: crear una vista de influence dentro de una transacción con `rollback`. NO dejes datos en producción.

Validación
- Desde la raíz: `npx tsc --noEmit -p .`, `npx vitest run src/lib/mobile-api` y eslint de los archivos tocados.
- Desde apps/mobile: `npm run validate`.
- Probalo en el Simulator contra producción y después sacá la vista de prueba.

Entrega
- Commit, push y PR a main.
- En la descripción del PR:
  - el EXPAND (`kinds=influence`; sin él, nada cambia);
  - que no hay migración;
  - lo que probaste.
- No hagas merge.
