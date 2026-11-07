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

Windows, Node **22.18.0**, npm **11.5.2**; dependencias instaladas conservadas. Sin instalaciones, bases remotas ni credenciales existentes. La entrega inicial (`fa3675a`) usó fixtures sintéticas y transporte simulado. La verificación real de los lectores se completó a continuación; la QA física sigue pendiente.

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

## Lectores reales contra esquema completo — #421

- **Entorno:** Docker Engine **29.9.2**, PostgreSQL **17.6** (`public.ecr.aws/supabase/postgres:17.6.1.105`), PostgREST **16.5** (`public.ecr.aws/supabase/postgrest:v16.5`), `supabase-js` **2.112.3**, Vitest **3.2.7**. GoTrue **2.197.0** se usa únicamente para crear su esquema Auth canónico, sin iniciar login ni emitir tokens.
- **Esquema:** las **93 migraciones** del checkout, en orden e incluida `0001.sql`, hasta `20261106024523_sleep_night_and_body_weight_sources_expand.sql`. Sin alterar los SQL versionados, constraints, triggers, lectores, contratos o políticas de producto. No se encontró un defecto de los lectores que requiriera corrección.
- **Transporte:** llamadas HTTP reales con las selecciones, filtros, orden y paginación de `readPeriodFeelingSource` y `readPeriodMeals`; también las vistas reales del handler con sus controles de revisión y parser compartido. PostgreSQL aplica RLS con rol `authenticated`, sin `BYPASSRLS`. Un hook exclusivo de la base descartable fija una de dos identidades sintéticas y después ejecuta el guard OAuth existente. Se configura en el rol local porque la configuración en base prevalece sobre el entorno de PostgREST. No se usan ni leen tokens existentes; las cabeceras sintéticas no autentican contra ningún producto desplegado.
- **Tres regresiones locales aprobadas**, en tandas: alimentación y contador, luego solo sensaciones tras ajustar la fixture de series al comportamiento de los triggers reales. Las selecciones embebidas devuelven objetos en los extremos a uno. Se contrastan filas, IDs, primeras series y agregados diarios con SQL independiente; el detalle de sensaciones coincide con el resumen construido por su lector habitual. Incluye referencia SQL independiente para el grupo respondido antes de la primera serie.
- **Datos:** 1.005 sesiones finalizadas del período, 1.005 filas de sensaciones y **1.722 series elegibles** (861 sesiones con primera serie); además fechas fuera de rango, sesiones en curso/descartadas, otra cuenta y series sin completar. Se recuperan **1.006 comidas activas** en seis días, incluida una `legacy_daily_summary`; la borrada y las de fuera de rango/otra cuenta quedan fuera. Todas las páginas se comparan por ID con SQL, sin duplicados ni truncamiento.
- **Semántica:** cero conocido, macros ausentes y totales parciales diferenciados, incluidos días sin entrenamiento. Se conserva el constraint vigente: una comida activa nueva requiere calorías; el cero de calorías se prueba con `sheet_import`. No se debilitan constraints para fabricar calorías ausentes o sensaciones corruptas; esos casos conservan la evidencia de dominio/contrato anterior.
- **Revisión real:** una escritura SQL entre páginas mueve el contador transaccional. El handler descarta la primera lectura y devuelve una nueva completa, idéntica a la lectura posterior y aceptada por el parser. Dos páginas por fuente en esta fixture: sensaciones **8 consultas / 2.185 bytes**, alimentación **4 / 1.616 bytes**; la prueba de revisión de alimentación requiere 8 consultas (dos intentos). Son costos locales sintéticos, no benchmarks ni SLA.
- **Checks adicionales:** TypeScript de raíz, ESLint dirigido y sintaxis del runner aprobados. Se reutilizan las 45 pruebas de raíz y 27 de Mobile de la entrega inicial; no hay cambios de aplicación que requieran repetirlas.

Reproducción desde el checkout, con Docker Linux local y las imágenes indicadas disponibles:

```powershell
node scripts/testing/period-details-local.mjs
# Repetir únicamente la regresión de sensaciones si ese es el cambio:
node scripts/testing/period-details-local.mjs --feelings-only
```

El runner crea red, nombres y etiquetas exclusivos; PostgreSQL no publica puerto y sus datos viven en tmpfs, PostgREST publica solo en `127.0.0.1` con puerto efímero y límite de 1.000 filas. Aplica el esquema, ejecuta la suite optativa `performance-insights-period-details.local.test.ts` y elimina solamente sus contenedores/red tras comprobar la etiqueta de esa ejecución, también si falla. Se comprobó que no quedaron recursos etiquetados de esta tarea. No resetea bases existentes ni elimina imágenes.

**Límites:** integración real PostgreSQL/PostgREST y RLS, no prueba de login/JWT de Supabase, proxy Kong, servidor Next desplegado ni configuración alojada. El handler se invoca en proceso con identidad de prueba; sus lecturas y contador viajan por HTTP real. QA física continúa sin realizar. La instancia local se eliminó; no se aplicó nada a producción ni a una base remota.

## Límites y entrega

- #420 continúa en borrador y **separado**: validación reservada no acreditada, investigación detenida. No se copiaron sus archivos experimentales ni se ejecutaron campañas, potencia o recalibración. Los métodos experimentales y sus compuertas no cambian; asociaciones experimentales deshabilitadas.
- Sin migraciones, producción, merges, builds/instalaciones Mobile ni QA física. La publicación de esta rama no actualiza la app instalada. API antes de adoptar los nuevos clientes; los anteriores siguen con sus vistas actuales.
- Previews bloqueadas para `codex/367-period-details` en `vercel.json`. PR borrador, sin auto-merge; publicación sin force.
- Rollback: volver a los enlaces y vista anteriores; no hay cambio de datos ni esquema que revertir. Las nuevas vistas son optativas y no escriben.
- [Matriz de cobertura](367-matriz-cobertura.md) y [única checklist física](367-qa-fisica.md) actualizadas; QA física pendiente, sin checklist paralela.

Refs #367. No cierra el issue ni acredita asociaciones.
