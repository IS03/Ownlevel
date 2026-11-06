# #367 — Tendencias de peso entre Insights y Cuerpo

Conecta el peso de Insights con las tendencias descriptivas que Cuerpo ya tenía, de ida y vuelta, con fecha, período y contexto. Solo Mobile. **Sin migración, sin backend y sin cambio de método.**

## Qué ya funcionaba y se reutiliza

Cuerpo (`body-trends-screen.tsx`) ya mostraba:
- el último registro con su fecha;
- el cambio dentro del período;
- la comparación opcional con otro período;
- un punto por registro real, sin suavizar ni interpolar, que abre su día en Historial;
- los pesajes sospechosos excluidos y contados;
- los pesajes para corregir.

No se duplicó nada.

## Qué cambia

**Desde Insights hacia Cuerpo**
- **Contexto del día:** «Peso corporal, ese día» ahora abre Cuerpo en el mes de ese día, para verlo en su evolución, cargarlo o corregirlo.
- **Detalle de la relación:** «Ver tu peso en Cuerpo» abre el tramo de los días de la relación, con el último año como máximo, el período más largo que lee Progreso. Antes abría Cuerpo sin período ni vuelta.

**Vuelta a Insights**
- Cuerpo aplica el período del enlace antes de la primera lectura, con el mismo `useProgressRouteRange` que Métricas.
- «Volver a Insights» regresa a la misma sesión, al mismo día abierto o a la misma relación.

**Lo que dice Cuerpo**
- **Abierto desde Insights:** «El peso de un día no dice si te pesaste antes o después de entrenar.»
- **Referencia del cambio:** ahora nombra la fecha de partida. Por ejemplo: «en octubre · desde 82 kg el 10 sep».
- **Cero:** un pesaje guardado en 0 kg se nombra con su fecha. El aviso es correcto con los dos servidores, y nunca se recalcula en el teléfono:
  - **Servidor que todavía lo cuenta** (lo manda como observación): «no es un peso, pero todavía entra en el cambio».
  - **Servidor corregido** (`codex/367-body-weight-fixes`, ya no lo manda): lo toma de los pesajes del período y dice que no cuenta en el gráfico ni en el cambio.
- **Pesajes:** un 0 kg dice «No cuenta: no es un peso» y nunca es la referencia del cambio del pesaje siguiente.

## Contrato y costo

- Sin cambios de contrato ni de backend.
- Sin consultas nuevas: Cuerpo hace la misma lectura con el período del enlace.

## Validación

- **Nuevas:**
  - Cuerpo desde Insights: el período del enlace en todas las lecturas, el aviso y la vuelta con fecha y sesión.
  - Cuerpo sin Insights: sin vuelta ni aviso.
  - Un pesaje en 0 kg con el servidor que todavía lo cuenta: nombrado, sin cambiar el cambio que da el servidor.
  - Un pesaje en 0 kg con el servidor corregido: el aviso sale de los pesajes del período, la fila lo marca y el cambio de la fila siguiente lo saltea.
  - El peso del día abre el mes correcto y vuelve.
  - La relación abre su tramo, con el último año como máximo, o sin fechas, y vuelve a la relación.
- **Ajustada:** el texto de referencia del cambio.
- **Mobile:**
  - tipos y lint sin errores ni advertencias;
  - Progreso, Insights, Cuerpo y Nutrición: 233 pruebas pasan. Después del ajuste del aviso, Progreso y Cuerpo: 57.
- **Sin cambios de Web ni del backend.** No se repitieron campañas ni suites amplias, y no se hizo QA física.

## Límites y propuestas

- **Correcciones de backend, en su propio PR** (`codex/367-body-weight-fixes`):
  - **Cero:** Web, Mobile e importaciones aceptaban 0 kg (`MIN_WEIGHT_KG = 0` y `allowZero` en el formulario de Mobile), y el informe de Cuerpo lo contaba como medición. Ahora queda fuera del análisis, contado y conservado, y se rechazan los 0 kg nuevos.
  - **Límite de lectura:** `listWeightHistory` perdía los pesajes más recientes después de 1000. Ahora el informe lee el historial completo por páginas.
  - **Orden de merge:** este PR funciona antes o después de ese, y su aviso es correcto en los dos casos.
- **Límite del aviso con el servidor corregido:** sale de los pesajes que Cuerpo ya cargó, los 30 más recientes y los que se pidan con «Ver más pesajes». Un 0 kg del período más viejo que eso no se nombra, pero tampoco cuenta.
- **No incluido:** cambios porcentuales, ventanas móviles ni familias estadísticas nuevas.
- **Principios que se mantienen:**
  - «Consistente» sigue deshabilitado.
  - Sin causas ni recomendaciones.
- **Requiere build de Mobile.** La QA física queda diferida, en la [lista única](367-qa-fisica.md).

Previews bloqueadas para `codex/367-weight-trends` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
