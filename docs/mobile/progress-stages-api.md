# Progreso › Tus etapas

Bocetos y decisiones en [bocetos/progreso-etapas/PLAN.md](../../bocetos/progreso-etapas/PLAN.md). Es solo una lectura: no tiene migración ni escrituras.

## API

`GET /api/mobile/v1/progress/stages`, sin parámetros. La identidad sale del Bearer. Devuelve `ProgressStages` ([contrato](../../src/lib/mobile-api/progress-stages-contract.ts)): la etapa actual y hasta 12 anteriores.

- Cada etapa se mide en su ventana: del inicio al día anterior a la etapa siguiente, nunca después de hoy, y como máximo los últimos 366 días.
- Las cuentas usan las mismas fuentes que Progreso:
  - **Comiste:** el snapshot de nutrición, con la misma regla de días completos.
  - **Peso por semana:** el historial de pesos, como pendiente de mínimos cuadrados. Hacen falta 3 registros que abarquen 10 días o más.
  - **Entrenos por semana:** las sesiones completadas, contando días distintos. Hacen falta 7 días medidos o más.
- Todo va por día o por semana porque las etapas duran distinto. Un dato que falta es `null` (nunca 0). Si una fuente no se pudo leer, figura en `sources` como `unavailable`.
- **Planes anteriores:** los planes guardados antes del modelo de etapas (`nutrition_goal_periods`) aparecen como etapas de solo lectura, solo para las fechas previas a la primera etapa. Su objetivo es el que aplicaron sus días.

## Mobile

- Progreso tiene un renglón "Tus etapas" que nunca se mezcla con el período.
- La sección se abre de a poco:
  1. la etapa actual con tres números;
  2. "Comparar con" una sola etapa (por defecto, la anterior);
  3. "Ver las N etapas" despliega la tabla completa.
- Cuerpo › Peso tiene un chip "Etapas", apagado por defecto, que dibuja las franjas de las etapas detrás de los puntos.
