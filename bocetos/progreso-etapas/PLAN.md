# Progreso · etapas (16/10)

Bloque A, punto 1 del plan. Comparar las etapas del plan nutricional en Progreso. Bocetos E1–E5 en `bocetos.entrenar.pen` (fila y≈33200) y en la galería.

## Decisión del usuario (16/10)

- Progreso sigue mostrando tu progreso en el período elegido. Se descartan "Etapa" en la barra de período (E1) y Comparar con lista de etapas (E2).
- La etapa se ve solo si querés: un renglón "Etapas" en la lista de Progreso y franjas que se prenden con un chip en los gráficos.
- Comparar etapas tiene su propia sección y se abre de a poco, no todo de golpe.

## Diseño final

- **Progreso:** último renglón de la lista, "Etapas · Déficit de primavera · semana 3 de 12". Solo aparece si hay etapas. Lleva a la sección.
- **Sección "Tus etapas", de a poco:**
  1. Arriba, la actual: nombre, tipo, fechas, avance y tres números (comiste vs objetivo, peso por semana, entrenos por semana).
  2. "Comparar con" una sola etapa, por defecto la anterior, con dos columnas. Se puede cambiar.
  3. "Ver todas" despliega la tabla completa (E3).
  4. Con una sola etapa, se muestra E5.
- **Gráficos de Peso y Nutrición:** chip "Etapas", apagado por defecto, que muestra las franjas (E4).

## Implementación (un PR, sin migración)

- **Servidor:** `GET /api/mobile/v1/progress/stages`. Por cada etapa (actual y hasta 24 pasadas), el resumen del rango con el mismo motor de Progreso. Los valores se normalizan por día o por semana porque duran distinto. La actual cuenta solo hasta hoy. Missing ≠ 0. Las etapas sin tipo se muestran como "Plan".
- **Mobile:** el renglón, la sección y las franjas.
