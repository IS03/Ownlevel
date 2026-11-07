# #367 — Fase 4: resumen de los últimos tres meses

«Últimos 3 meses» en Insights: entrenamiento, rutinas, sensaciones al terminar, comidas registradas y peso semana a semana, con fechas exactas y un resumen escrito determinístico. **Solo descripción: no calcula ni publica asociaciones.** Sin migración. Las vistas existentes no cambian.

## Qué cambió

- **Período** (`periodOf`): los tres meses calendario completos anteriores al mes en curso, por la fecha de Córdoba.
  - Nunca se elige por los resultados, y el mes en curso nunca entra.
  - Probado en cruces de año y en un febrero bisiesto.
- **Motor** (`insights-period/1`, `period.ts`), con las funciones existentes:
  - **entrenamiento:** sesiones, días y días con varias sesiones. Conteos estrictos y parciales por separado, sumados día a día; la cobertura se recalcula con las sumas;
  - **rutinas:** las registradas, con su primera y última fecha. Se muestran en orden solo si una terminó antes de la siguiente; si no, como alternadas;
  - **sensaciones:** `describeFeelingOutcome` (#412) sobre las sesiones del período;
  - **comidas:** días con comidas sobre los días del período, y por macro: días completos, días con el dato faltante, total registrado y mediana diaria;
  - **peso:** `body-weekly/1` (#415) sobre todos los pesajes del período.
- **Ruta** (`view=period`):
  - reutiliza el snapshot de Insights y suma una lectura paginada de los pesos del período en `day_logs`, por el usuario del token, también los días sin entrenamiento;
  - las dos fuentes quedan bajo el mismo contador de revisión, que se mueve cuando cambia un peso. Un reintento, y después no disponible;
  - no acepta período, página ni filtros.
- **Contrato:** vista nueva y compatible. El parser verifica que las fechas sean meses enteros, que los conteos sumen, que cada parte tenga su método y que no haya asociaciones.
- **Mobile:**
  - fila «Últimos 3 meses» en Insights y pantalla propia, que lee una vez al abrirse;
  - resumen escrito con una frase por hecho y su cifra, sin causas;
  - secciones con sus filas y enlaces a los días de Insights, a «Cómo terminaste» y al peso en Cuerpo con los mismos tres meses;
  - desde Cuerpo, «Volver a Insights» vuelve al resumen (`insightsSummary=1`);
  - estados distintos para vacío, cobertura insuficiente y lectura fallida.

## Revisión de #416

- **Sensaciones en el resumen escrito:** antes una sola frase decía «Respondiste cómo terminaste» contando solo la energía. Ahora hay una frase por sensación, con su cobertura real: «Energía al terminar: respondida en 2 de 3 sesiones; 1 sin respuesta» y «Fatiga al terminar: respondida en 1 de 3 sesiones; 1 más tarde y 1 sin respuesta». Una respuesta tardía, sin hora o ilegible nunca se cuenta como ausente.
- **Período en el contrato:** `parsePeriod` aceptaba fechas que contradecían el período anunciado: fin a mitad de mes, meses no consecutivos o desordenados, cantidad de días incorrecta, o un período corrido de mes. Ahora calcula el período esperado desde `today` (`periodOf`, en `period-range.ts`, sin dependencias para que el contrato no cargue el motor) y exige que coincidan inicio, fin, meses y días. Semanas, pesajes y fechas de rutinas tienen que caer dentro del período.
- **Regresiones:**
  - energía y fatiga con coberturas distintas, con una respuesta tardía y una ausente;
  - fin a mitad de mes, meses desordenados o salteados, días incorrectos, período corrido, `today` que no corresponde, rutina fuera del período, semana y pesaje fuera del período;
  - aceptación correcta en un cruce de año y en febrero bisiesto.

## Evidencia

- **Equivalencia con `main`:** las 53 vistas existentes son idénticas en la huella de equivalencia.
- **Costo** (historia de 5 años, 1311 sesiones):
  - **pedidos:** con el snapshot en caché, 3 (contador, una página de pesos, contador). En frío se suma la lectura completa que Insights ya hace. Ninguno por semana, mes, tarjeta o ejercicio;
  - **tiempo:** el snapshot tarda lo mismo que en `main`, 244 ms. La vista, 0,29 ms;
  - **tamaño:** 8,3 KB, contra 73 KB del resumen principal.
- **Pruebas nuevas:**
  - **período:** límites de mes y año, bisiesto, día 1;
  - **conteos:** sesiones dentro y fuera, varias sesiones en un día, métodos separados;
  - **rutinas:** en orden y alternadas;
  - **comidas:** cobertura y faltante que no es cero;
  - **peso:** días sin entrenar, semanas cortadas por el borde, sin interpolación;
  - **sensaciones:** solo las del período;
  - **contrato:** rechazos;
  - **ruta:** reutilización, filtros de la lectura de pesos, reintento y parámetros;
  - **Mobile:** una lectura, fechas, resumen escrito sin causas, métodos separados, detalles con vuelta, alternancia, cobertura insuficiente, vacío y lectura fallida.
- **Pruebas que pasan:**
  - Web: 170 en motor, cuerpo y ruta. Con #416: 61 en las suites afectadas;
  - Mobile: 68 en las suites afectadas. Con #416: 42;
  - tipos y lint sin errores.
- **Sin campañas estadísticas:** es una presentación descriptiva.

## Límites

- **Período fijo:** siempre los últimos tres meses completos. No se puede elegir otro.
- **Sensaciones:** el enlace a «Cómo terminaste» abre todo el historial, no solo el período, y lo dice.
- **Comidas:** no hay un detalle propio del período.
- **Sin producción:** no se midió con datos reales ni en producción.

## Pendientes

- **Mobile:** requiere build. La QA física está diferida, en la [lista única](367-qa-fisica.md).

Previews bloqueadas para `codex/367-period-summary` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
