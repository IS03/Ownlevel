# Progreso · Lo que se movió junto (comida × cuerpo y rendimiento)

Decisiones del 16/10:
- Va dentro de "Tu octubre", después de Peso, Entrenamiento, Nutrición y Métricas.
- Compara siempre contra el período anterior equivalente, aunque Comparar esté apagado.
- Las parejas son las que pidió Nacho:
  - **Proteína · Fuerza**
  - **Carbos · Fuerza**
  - **Carbos · Energía** (la energía al finalizar el entrenamiento, de 1 a 5)
  - **Calorías · Peso**

Bocetos: `bocetos.entrenar.pen`, en y = 34400 (C1–C4), y los PNG de esta carpeta.

## Qué muestra

| Historia | Lado comida | Lado cuerpo o rendimiento | Aparece cuando |
|---|---|---|---|
| Proteína · Fuerza | proteína promedio por día con comidas y cambio | ejercicios comparables que mejoraron (1RM estimado, Epley) | ≥ 1 ejercicio repetido en los dos períodos y comidas en ≥ 4 de 7 días (o la mitad en períodos largos) |
| Carbos · Fuerza | carbos promedio por día y cambio | el ejercicio con más cambio de 1RM estimado, o "X de Y mejoraron" | igual que arriba |
| Carbos · Energía | carbos promedio | energía al finalizar promedio (1–5) y cambio | ≥ 2 sesiones con energía cargada en cada período |
| Calorías · Peso | kcal promedio y cambio | tendencia de peso (mínimos cuadrados) y cambio | ≥ 3 pesajes en ≥ 10 días en cada período |

- Orden: primero las que tienen el cambio más grande en las dos puntas. Se ven hasta 4; si no alcanza ninguna, la sección muestra solo "Todavía no alcanza".
- Una historia se muestra aunque los dos lados vayan "en contra" (más carbos y menos energía): se cuenta igual, con flechas, sin juzgar.
- Detalle (C2, C3):
  - Los dos números arriba.
  - El lado comida semana por semana, con el período anterior en gris y barras desde 0.
  - El lado rendimiento: ejercicios con 1RM antes → ahora, o el peso por semana.
  - Cierra con "Probarlo en Qué influye", con la pregunta ya armada.
- "Todavía no alcanza" (C4) dice qué falta, con números reales. Es distinto de "No pudimos cargar", que es una falla.

## Reglas
- **Nunca afirma causas.** Usa "al mismo tiempo" y "mientras", nunca "porque". El encabezado lo aclara una vez.
- **Faltar no es cero.** Los promedios de comida usan solo los días con comidas. Los días sin registro no bajan el promedio.
- **Sin colores de bueno o malo:** las subas y bajas van con flecha.
- **Cifras tabulares,** con el formato de pantalla (62,7 kg; 2.240 kcal).
- **1RM siempre rotulado "estimado".** Epley con 1–12 repeticiones y solo en kg (igual que hoy).

## Servidor (EXPAND, sin migración)
- `GET /api/mobile/v1/progress/connections?from&to&compareFrom&compareTo`. La app manda siempre B (el período anterior equivalente, que ya calcula `compareRange`).
- Devuelve hechos, no textos:
  - una lista de historias `{ key, food: { value, previous, unit, coverage }, outcome: {...}, ready: boolean, missing?: {...} }`;
  - para el detalle: las series semanales y los ejercicios comparables.
- Reutiliza lo que ya existe:
  - promedios de nutrición (`progress-server`);
  - ejercicios comparables y 1RM estimado (`progress-training`, `training-performance`);
  - tendencia de peso (`progress-stages.weightPerWeek`);
  - energía al finalizar (`training_sessions.energy_level`, 1–5).
- La Web ya tiene un motor de relaciones (`src/lib/progress/relationships`): catálogo de exposición (nutrición) → resultado (cuerpo y entrenamiento), Spearman y umbrales. Para "Qué influye" con fuerza y medidas conviene apoyarse en él.
- Parser estricto en `src/lib/mobile-api/progress-connections-contract.ts`, compartido con Expo, y pruebas de cobertura, faltantes y "faltar no es cero".

## App
1. Sección en `overview-screen.tsx` (dentro de "Tu octubre"), con su propio recurso. Si falla, muestra "No pudimos cargar" sin tapar lo demás.
2. Pantalla de detalle `/(tabs)/progress/connections/[key]` con `ProgressScroll`: título compacto y rango.
3. "Probarlo en Qué influye" abre el armador con la pregunta precargada (`split` comida, `outcome` rendimiento).

## Pasos

Estado (17/10): pasos 1–3 hechos (#274, #275, #276). Falta el QA físico (paso 4).

1. **Servidor y contrato.** Lectura `GET /api/mobile/v1/progress/connections`, parser estricto y pruebas. Sin migración y sin tocar la app.
   - Prompt: `PROMPT-codex-paso1.md`.
2. **App · sección en "Tu octubre".**
   - Cliente de la API.
   - La sección "Lo que se movió junto" con las historias (C1) y "Todavía no alcanza" (C4).
   - Estados: cargando, no disponible (distinto de vacío) y recarga con el período.
   - Siempre manda B = período anterior equivalente.
3. **App · detalle.**
   - Pantalla `/(tabs)/progress/connections/[key]` con `ProgressScroll` (C2, C3): la comida semana por semana con el anterior en gris, y los ejercicios comparables o el peso por semana.
   - "Probarlo en Qué influye" con la pregunta precargada.
4. **QA y cierre.** QA físico, ajustes de copy y actualizar Notion y PENDIENTES.

## Después
- Qué influye acepta fuerza por ejercicio (1RM estimado) y medidas del cuerpo como resultado, por semana.
- El aviso automático puede usar estas historias.
