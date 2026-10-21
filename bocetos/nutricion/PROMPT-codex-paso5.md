# Nutrición · Paso 5: Detalle del día (Mobile + EXPAND de lectura)

Hacelo de punta a punta sin pedir OK: planificás, implementás, validás, probás en el Simulator, hacés commit y push, y abrís un PR a `main` en `IS03/Ownlevel`, listo para revisión. El merge lo hago yo.

Leé primero:
- `AGENTS.md`;
- `docs/brand/ownlevel-marca/IDENTIDAD.md` (Gráficos, Tono, Vidrio);
- `bocetos/nutricion/PLAN.md` (esto es el paso 5);
- `bocetos/PENDIENTES.md` (el EXPAND "Qué cambia hoy").

## Bocetos (`bocetos/nutricion/`)
- `08-N11-detalle-plan-con-extras.png`: un plan con extras ("Qué cambia hoy").
- `09-N12-detalle-gasto-fijo.png`: un plan con gasto fijo ("De dónde sale").

**Corrección sobre el boceto:** no uses "Gastaste". El gasto es una estimación del plan, no algo medido. Usá **"Comiste"**, **"Gasto estimado"** (con "según tu plan" debajo) y **"Balance del día"** con la flecha neutra, sin verde ni rojo.

## Qué construir
Reemplazá el contenido de la hoja "Detalle del día", que hoy es una lista de datos crudos (`day-details.tsx`, `NutritionDayDetailSheet` en `day-panel.tsx`). Se abre desde "Detalle" en el panel "Tu día".

1. **Energía:**
   - barra de "Comiste" con la marca del objetivo;
   - barra de "Gasto estimado";
   - "Balance del día".
   - Sin dato ≠ 0: si falta un valor, la barra no se dibuja y se ve "—".
2. **"Qué cambia hoy"** (N11), solo si el plan tiene extras configurados: una fila por cada factor, con lo que suma hoy.
   - Hoy los factores son entrenamiento y día laboral; dejalo preparado para que el plan sume otros.
   - Cada fila muestra:
     - el estado ("No hubo sesión hoy", "Sí, por tu horario", "Ajustado hoy");
     - el aporte ("+250 kcal");
     - si suma al objetivo, al gasto o a ambos.
   - Abajo, la base del plan: "Base del plan 1.900 kcal objetivo · 1.850 kcal gasto".
   - Si el plan no tiene un factor, ese factor no aparece.
3. **"De dónde sale"** (N12), cuando el gasto es fijo, sin extras: "Gasto de tu plan · Fijo, todos los días" y "Objetivo · Automático".
4. **Ajustado hoy:** si el día tiene un ajuste manual de objetivo o de gasto, la fila dice "Ajustado hoy" y ofrece **"Volver al automático"**, usando la escritura de contexto que ya existe.
5. **"Ajustar hoy"**, arriba a la derecha, abre el editor de contexto que ya existe. Las métricas ya tienen su propia hoja (paso 2), así que no las repitas acá.

## Servidor (EXPAND de lectura, aditivo)
Hoy el contexto del día trae solo los totales: objetivo, gasto, automático u ajuste, entrenamiento y trabajo vigentes y su origen. No trae **cuánto suma cada factor** ni la base del plan.

- Agregá al contexto de `GET /api/mobile/v1/nutrition/days/{date}` un campo **opcional** `breakdown` con:
  - la base del objetivo y del gasto;
  - una lista de factores `{ key: 'training' | 'work' | …, appliesTo: 'target' | 'expenditure' | 'both', deltaKcal, active, source }`;
  - el modo del gasto (fijo o con extras).
- Sacalo de lo que ya resuelve el día: las tablas del plan (`nutrition_plan_periods`, `nutrition_plan_weekdays`) y la configuración de energía (`energy_config_periods`), con la misma regla que usa el resolvedor para calcular el objetivo y el gasto. Los números del desglose tienen que **cerrar** con los totales que ya devuelve. Si no cierran, el desglose no se manda.
- Es una lectura: no hay idempotencia ni escrituras. Mantené la identidad por token y el ownership, como en el resto del día.
- Si no se puede calcular con certeza (días pasados sin snapshot de la base, o un día con ajuste manual), mandá `breakdown: null`. La app muestra entonces solo la energía y "Ajustado hoy" si corresponde, sin inventar el desglose.
- **Preferí resolverlo en el servidor TypeScript, sin migración.** Si de verdad hace falta tocar una función SQL:
  - que sea aditiva;
  - validala localmente con el runner de `scripts/testing`;
  - aplicala en el proyecto de Supabase "gym";
  - alineá el nombre del archivo con la versión aplicada;
  - documentala en el PR.
- Tests del servidor:
  - plan con extras (entrenamiento hecho y no hecho, día laboral);
  - gasto fijo;
  - ajuste manual (`breakdown: null`);
  - que el desglose sume los totales;
  - ownership.
- Parser de Mobile tolerante: sin `breakdown` o con `breakdown: null`, todo funciona como hoy.

## Reglas
- Marca:
  - un solo acento;
  - cifras tabulares;
  - voseo, sin exclamaciones;
  - sin colores de bueno o malo sobre la ingesta ni el balance.
- Estilo E5: plano sobre el fondo, con separadores finos y sin tarjetas blancas. La hoja abre como las otras: el fondo aparece con un fundido y solo la hoja sube.
- VoiceOver: cada fila se lee completa ("Entrenamiento, no hubo sesión hoy, más cero kilocalorías al objetivo").

## Validación y entrega
- `npm run validate` en `apps/mobile`. En la raíz: `tsc` y `vitest src/lib/mobile-api`.
- QA en el Simulator, en claro y oscuro, en un día de hoy y en un día pasado. Si probás "Volver al automático", dejá el día como estaba.
- Rama `codex/m9-nutrition-day-detail`.
- Actualizá `bocetos/PENDIENTES.md`: marcá el EXPAND "Qué cambia hoy" y anotá lo que quede afuera.
