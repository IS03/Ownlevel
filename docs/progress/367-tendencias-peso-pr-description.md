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
- **Cero:** un pesaje guardado en 0 kg se nombra con su fecha y se avisa que hoy entra en el cambio. No se oculta ni se recalcula en el teléfono.

## Contrato y costo

- Sin cambios de contrato ni de backend.
- Sin consultas nuevas: Cuerpo hace la misma lectura con el período del enlace.

## Validación

- **Nuevas:**
  - Cuerpo desde Insights: el período del enlace en todas las lecturas, el aviso y la vuelta con fecha y sesión.
  - Cuerpo sin Insights: sin vuelta ni aviso.
  - Un pesaje en 0 kg nombrado, sin cambiar el cambio que da el servidor.
  - El peso del día abre el mes correcto y vuelve.
  - La relación abre su tramo, con el último año como máximo, o sin fechas, y vuelve a la relación.
- **Ajustada:** el texto de referencia del cambio.
- **Mobile:**
  - tipos y lint sin errores ni advertencias;
  - Progreso, Insights, Cuerpo y Nutrición: 233 pruebas pasan.
- **Sin cambios de Web ni del backend.** No se repitieron campañas ni suites amplias, y no se hizo QA física.

## Límites y propuestas

- **Peso en cero, propuesta de backend:**
  - Web y las importaciones aceptan 0 kg (`MIN_WEIGHT_KG = 0`); Mobile no.
  - Insights lo trata como inválido, pero `buildBodyProgressReport` lo cuenta como medición en Web y en Mobile.
  - Propuesta: excluirlo del informe y contarlo aparte, como los sospechosos, y rechazar 0 en el formulario de Web.
- **Límite de lectura, propuesta de backend:**
  - `listWeightHistory` ordena de más viejo a más nuevo con `limit(1000)`, así que con más de 1000 pesajes se pierden los más recientes.
  - Propuesta: leer los más recientes primero y reordenar, o paginar.
- **No incluido:** cambios porcentuales, ventanas móviles ni familias estadísticas nuevas.
- **Principios que se mantienen:**
  - «Consistente» sigue deshabilitado.
  - Sin causas ni recomendaciones.
- **Requiere build de Mobile.** La QA física queda diferida, en la [lista única](367-qa-fisica.md).

Previews bloqueadas para `codex/367-weight-trends` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
