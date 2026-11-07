# #367 — Detalles del resumen de tres meses

Desde «Últimos 3 meses» se puede abrir energía/fatiga o los días con alimentación registrada, conservando exactamente el período al ir a Nutrición y volver. Descripción únicamente: no busca ni publica relaciones. Rama `codex/367-period-details`, desde `main` en `f32289a` (#419).

## Comportamiento y contratos

- **Sensaciones:** reutiliza `describeFeelingOutcome` y su presentación existente. Energía y fatiga ordinales e independientes, con sus coberturas y estados de captura separados; sin medias ni puntajes. Las primeras series conservan la elegibilidad de respuestas previas. «Cómo terminaste» continúa como recorrido independiente sobre todo el historial.
- **Alimentación:** reutiliza la agregación de `nutritionDays`; incluye comidas y resúmenes diarios legacy activos en las fechas, también sin entrenamiento. Totales diarios de kcal, proteína, carbohidratos y grasas, con el número de registros sin cada dato. Sin dato no es cero; un total con datos faltantes se rotula parcial. Se cuentan aparte los días sin comidas registradas. Nunca afirma ingesta completa.
- **Navegación:** resumen → detalle → Nutrición en la fecha → detalle de origen → resumen. `asOf` conserva la fecha de referencia del período aun al cambiar de mes/año. Fechas completas en detalles y aviso al conservar un resumen de un mes anterior. Las pantallas revalidan al volver, sin cargar detalles al finalizar una sesión.
  El ancla fija las fechas, no congela las fuentes: una corrección posterior se muestra en una nueva lectura completa con su revisión actual.
- **API compatible:** vistas optativas `period-at`, `period-feelings`, `period-nutrition` de `performance-insights`, método descriptivo `insights-period/1`. `asOf` determina los tres meses completos anteriores; `today` sigue siendo la fecha actual de lectura. Se rechazan anclas inválidas/futuras, parámetros duplicados y filtros ajenos. El cliente rechaza respuestas de otra vista o ancla. `view=period`, `feelings` y las demás respuestas existentes mantienen forma y comportamiento; no se agrega un campo obligatorio a clientes instalados.
- **Consistencia:** identidad del contexto autenticado y filtros por cuenta, rango y fuentes activas; contador antes/después de todas las páginas, un reintento completo y luego no disponible. No se unen revisiones. Caché existente aislada por cliente/cuenta; errores con lectura previa la muestran identificada, nunca como una lectura vacía confirmada. Los detalles avisan si la revisión difiere de la que abrió el resumen.

## Validación local dirigida — 7 de noviembre de 2026

Windows, Node **22.18.0**, npm **11.5.2**; dependencias instaladas conservadas. Sin instalaciones, bases remotas ni credenciales. Fixtures sintéticas; las pruebas de API usan un cliente Supabase simulado y un autenticador simulado con cabecera literal no válida en producción. **No se acredita con esto una ejecución real de los nuevos joins en PostgREST ni QA física.**

- **Raíz: 45 pruebas aprobadas**, en `period-details.test.ts`, `performance-insights-period-details.test.ts`, `period.test.ts` y `performance-insights.test.ts`: equivalencia descriptiva con el resumen, coberturas distintas, captura previa a primera serie, ausencias/tardías/ilegibles/sin hora, fechas, vacío, nutrientes parciales/ausentes/cero, legacy, días sin entrenar, aislamiento, páginas, cambio de revisión y fallos. Incluye las regresiones afectadas de las respuestas existentes.
- **Mobile: 27 pruebas aprobadas**: 6 de detalles, 6 del resumen, 4 de «Cómo terminaste», 10 de contexto diario y 1 nueva dirigida en la pantalla real de Nutrición (las otras 23 de esa suite no se repiten). Recorridos y parámetros reales, cambio de año, refresco y reintento, lectura fallida distinta de vacío, respuesta de otra ancla y cambio de cuenta. Componentes renderizados con Jest; no es una prueba en dispositivo ni de un router nativo ejecutándose.
- **Tipos:** raíz y Mobile aprobados. **Lint:** ESLint dirigido en raíz y `npm run lint` en Mobile, aprobados. Se reutilizó evidencia ajena sin repetir campañas estadísticas, suites completas no afectadas ni benchmarks grandes.

## Consultas y tamaño

Medición del cuerpo JSON UTF-8, sin compresión ni cabeceras, sobre la misma fixture pequeña (8 sesiones del período, 4 fechas con alimentación, 92 días calendario):

| Vista | Consultas sin cambio de revisión | Respuesta |
|---|---:|---:|
| `period-feelings` | 5: contador + sesiones/respuestas/series + contador | 2.129 bytes |
| `period-nutrition` | 3: contador + comidas + contador | 1.221 bytes |

Lecturas agrupadas y filtradas por las fechas en servidor; no hay pedidos por sesión, tarjeta o día. Páginas de hasta 1.000 filas: 1.001 comidas de una fecha requieren 4 consultas, no 1.001. Un cambio de revisión obliga a releer todo: 10/6 consultas en las fixtures respectivas. Un segundo cambio devuelve 503 sin publicar un resultado parcial. El resumen conserva su lector/snapshot existente; no precarga estos detalles. No son latencias productivas, un SLA ni una medición de volumen real.

## Límites y entrega

- #420 continúa en borrador y **separado**: validación reservada no acreditada, investigación detenida. No se copiaron sus archivos experimentales ni se ejecutaron campañas, potencia o recalibración. Los métodos experimentales y sus compuertas no cambian; asociaciones experimentales deshabilitadas.
- Sin migraciones, producción, merges, builds/instalaciones Mobile ni QA física. La publicación de esta rama no actualiza la app instalada. API antes de adoptar los nuevos clientes; los anteriores siguen con sus vistas actuales.
- Previews bloqueadas para `codex/367-period-details` en `vercel.json`. PR borrador, sin auto-merge; publicación sin force.
- Rollback: volver a los enlaces y vista anteriores; no hay cambio de datos ni esquema que revertir. Las nuevas vistas son optativas y no escriben.
- [Matriz de cobertura](367-matriz-cobertura.md) y [única checklist física](367-qa-fisica.md) actualizadas; QA física pendiente, sin checklist paralela.

Refs #367. No cierra el issue ni acredita asociaciones.
