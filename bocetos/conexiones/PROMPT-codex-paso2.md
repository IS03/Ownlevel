Progreso · "Lo que se movió junto" · paso 2: la sección en la app

Contexto
- Repo OWNLEVEL. Leé AGENTS.md y CLAUDE.md (identidad de marca).
- Plan: `bocetos/conexiones/PLAN.md`. Bocetos:
  - `bocetos/conexiones/01-C1-lo-que-se-movio-junto.png`;
  - `bocetos/conexiones/04-C4-todavia-no-alcanza.png`.
- El paso 1 ya está en main (PR #274):
  - `GET /api/mobile/v1/progress/connections`;
  - contrato en `src/lib/mobile-api/progress-connections-contract.ts`.
- Rama nueva desde main: `codex/m9-progress-connections-section`.
- Solo `apps/mobile`. No toques el servidor ni el contrato.

Objetivo
Dentro de "Tu octubre" (la sección del período en `apps/mobile/src/progress/overview-screen.tsx`), después de las filas de Peso, Entrenamiento, Nutrición y Métricas, una sección "Lo que se movió junto" con las historias que alcanzan y, aparte, las que todavía no alcanzan.

1) Cliente
- `apps/mobile/src/api/progress-connections.ts`, con el mismo patrón que `src/api/progress-stages.ts`: reexporta el contrato y `fetchProgressConnections(client, query, compare, signal)`, que manda `period`/`from`/`to` y `compareFrom`/`compareTo`.
- Usá el mismo armado de parámetros que `fetchProgressOverview`; no inventes otro.

2) Siempre contra el período anterior
- La sección compara siempre A con el período anterior equivalente, aunque Comparar esté apagado o comparando con otra cosa ("Año pasado", un rango propio).
- Calculá B con `compareRange({ ...state, compare: { kind: 'previous' } }, today)` de `progress-range.ts`.
- La sección tiene su propio recurso (`useProgressResource`) con su propia clave. Se relee cuando cambia el período y en el refresco de la pantalla. Si falla, no tapa el resto de Progreso.

3) Qué muestra (boceto C1)
- Encabezado:
  - "Lo que se movió junto";
  - debajo, una línea: "{A} frente a {B}." Usá la etiqueta corta de cada período: "Octubre frente a septiembre", "Esta semana frente a la anterior", o las fechas con `shortRange` si es un rango propio. Cuando A está en curso agregá ", a la misma altura del mes" o lo equivalente;
  - y la aclaración: "Pasaron al mismo tiempo: no quiere decir que una cosa cause la otra."
- Historias `ready`, en el orden de `ranking`. Cada una es una fila tocable que en este paso no navega (el detalle es el paso 3). Dejala con `accessibilityRole` "button" deshabilitado o sin chevron. Tiene:
  - **rótulo chico en mayúsculas:** PROTEÍNA · FUERZA, CARBOS · FUERZA, CARBOS · ENERGÍA, CALORÍAS · PESO;
  - **título armado con los datos** (más/menos según el signo, sin juicio):
    - protein_strength: "Más proteína y 4 ejercicios que mejoraron" (o "Menos proteína y …", "… y ningún ejercicio mejoró");
    - carbs_strength: "Más carbos y {top.name} más pesada/o" según el signo de top. Si top bajó, "… y {top.name} más liviana/o". Si es igual, "… y {top.name} igual";
    - carbs_energy: "Más carbos y más energía al terminar" (o menos);
    - kcal_weight: "Menos calorías y menos peso" (o la combinación que corresponda).
    - Si el cambio de comida es menor al 3 %, usá "Mismos carbos", "Misma proteína" o "Mismas calorías".
  - **dos valores lado a lado, separados por una línea fina:**
    - comida: valor actual con unidad ("142 g", "2.240") y debajo "proteína por día · ↗ 18 g" (flecha ↗/↘ y la diferencia absoluta; "=" si es 0);
    - resultado:
      - fuerza: "4 de 6" y debajo "ejercicios mejoraron"; en carbs_strength, el 1RM de top ("102,5 kg") y debajo "{top.name} (estimado) · ↗ 5";
      - energía: "4,1 de 5" y debajo "energía al finalizar · ↗ 0,6";
      - peso: "62,7 kg" y debajo "tendencia · ↘ 0,6 kg".
- Historias `insufficient`: debajo, bajo el rótulo "TODAVÍA NO ALCANZA", una fila por historia con ícono de reloj de arena (gris), título ("Proteína y fuerza", "Carbos y fuerza", "Carbos y energía", "Calorías y peso") y la frase con `missing`:
  - food_days: "Hacen falta comidas en {need} días {del período|de la semana anterior…}. Tenés {have}.";
  - comparable_exercises: "Hace falta repetir un ejercicio en los dos períodos.";
  - energy_sessions: "Hacen falta {need} entrenamientos con la energía cargada en cada período. {Este|El anterior} tiene {have}.";
  - weigh_ins: "Hacen falta {need} pesajes en cada período. {Este|El anterior} tiene {have}.";
  - weigh_in_span: "Hacen falta pesajes separados por al menos {need} días. Hoy abarcan {have}."
  - Usá `missing.period` para decir si falta en el actual o en el anterior.
- Historias `unavailable`: una sola línea "No pudimos cargar {nombre}. Reintentá más tarde." con el botón de reintentar del recurso. Es distinto de "Todavía no alcanza".
- Si las cuatro están `insufficient`: solo el bloque "Todavía no alcanza" y, si el período es "Semana", el link "Ver el mes →" en champagne, que cambia el período a mes.
- Cargando: skeleton del alto de dos historias. Error de la lectura entera: `InlineUnavailable` con Reintentar.

4) Marca y formato (CLAUDE.md)
- Estilo editorial, sin tarjetas: renglones separados por línea fina, como las filas de "Tu octubre".
- Números con `numeric` (cifras tabulares) y en formato de pantalla: "62,7 kg", "2.240". Usá `formatValue` y `arrowDelta` de `progress-format.ts`.
- Sin rojo ni verde: las subas y bajas van con flecha, siempre en `muted`/`text`. El champagne va solo en el link "Ver el mes".
- "Faltar no es cero": si un valor viene `null`, no lo muestres como 0.
- VoiceOver: cada historia se lee completa en una sola etiqueta ("Proteína y fuerza. 142 gramos de proteína por día, 18 más. 4 de 6 ejercicios mejoraron."). El rótulo en mayúsculas no se lee aparte.

5) Tests (`apps/mobile/src/progress/connections.test.tsx`)
- Siempre manda B = período anterior, aunque Comparar esté en "Año pasado" o apagado.
- Orden por `ranking`; las `insufficient` van abajo con su frase según `reason` (una por cada reason, incluido weigh_in_span); `unavailable` muestra "No pudimos cargar" y no "Todavía no alcanza".
- Un `null` nunca se muestra como 0.
- Las cuatro insuficientes con Semana muestran "Ver el mes" y al tocarlo cambia el período.
- El fallo de la lectura no rompe el resto de la overview.
- Los títulos con más/menos/mismo según los signos.

Validación
- Desde `apps/mobile`: `npm run validate` y `npx expo export --platform ios`.
- Mirá la sección en el Simulator con datos reales (sin crear datos de prueba en producción).

Entrega
- Commit, push y PR a main. En la descripción: qué muestra, que siempre compara con el anterior, y que el detalle es el paso 3.
- No hagas merge.
- No toques `apps/mobile/.env.local`.
