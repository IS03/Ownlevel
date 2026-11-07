# #367 — Ejecución del ecosistema Mobile

Base: `main` en `6d94f31` (#422), checkout limpio. #420 continúa borrador y separado; investigación detenida. Sin Web ni #402.

| Capacidad | Estado comprobado / trabajo acotado |
|---|---|
| Comparación de carga/reps, referencia compatible y evidencia | Ya implementada; conservar métodos, modos y unidades. |
| Todas las sesiones del día, sensaciones, cuatro nutrientes diarios y métricas | Ya implementados; completar enlaces y contexto temporal, no duplicar su dashboard. |
| Inicio/final | Fuentes presentes; falta duración y evidencia temporal accesible. Falta de timestamps se declara. |
| Proteína, calorías, carbohidratos y última comida previos | Ya calculados; reutilizar exactamente, incluido el alcance legacy de carbohidratos. Falta acceso agrupado a sus registros. |
| Comidas posteriores | Falta descripción/presentación. Usar fuentes existentes, sin candidatos ni asociaciones nuevos. |
| Peso y medianas semanales; detalles de tres meses | Ya implementados y verificados en #421; falta exploración conjunta semana/día y conservar el origen entre recorridos. |
| Asociaciones de sensaciones, horarios y evolución corporal | Bloqueadas por validación. No ampliar, recalibrar ni publicar. |
| Registro completo de ingesta, horas desconocidas, contexto histórico no capturado | Faltan datos; no completar retrospectivamente ni inferir ausencia de consumo. |

## Orden ejecutable

1. **PR funcional de contexto temporal:** desde día/sesión, detalle agrupado de todas las sesiones de ese día, inicio/final/duración y evidencia previa/posterior. Vista optativa nueva, lectores compartidos y contador por cuenta. Reutilizar el lector agrupado vigente; no agregar consultas por sesión/tarjeta. Verificar costo y paginación con fixtures. No calcular asociaciones al abrir este detalle.
2. **Exploración semanal y conexiones del período:** ampliar el recorrido existente de tres meses con semanas/días, denominadores independientes y enlaces al día/sesión/evidencia y dominios. Reutilizar #421 y medianas de Cuerpo; no mezclar revisiones ni crear otro dashboard.
3. **Después del núcleo funcional:** #399 y #418 en PRs separados. Reproducir con relecturas controladas, preservar recibos/journals/recuperación y distinguir transitorio confirmado de fallo real.
4. Pruebas dirigidas por entrega, tipos/lint; lectores/joins nuevos contra PostgREST descartable. Al cerrar la combinación, una validación Mobile completa. QA únicamente en la checklist existente, sin aprobarla físicamente.

## Decisión previa al código: ventana posterior `session-temporal/1`

- Una única ventana descriptiva: **[final de sesión, final + 3 horas)** en instantes. La igualdad con el final entra; la igualdad con final+3 h queda fuera. Las 3 h dan coherencia de presentación con el contexto previo, **no validez fisiológica**.
- Fecha y hora en Córdoba (`America/Argentina/Cordoba`). Duración solo entre inicio/final válidos y ordenados; no es tiempo activo. Sin final no existe ventana calculable. No usar `created_at`/`updated_at` como hora del hecho.
- Sumar únicamente registros con hora explícita según `mealTimeEvidence`, nunca convertir macros en calorías. Cada nutriente mantiene su suma conocida y su propio contador faltante. Sin comidas no es cero/ayuno ni ingesta completa.
- Si la ventana no terminó al corte de lectura, se rotula **provisional**. No incluir horas futuras al corte; mostrar ese corte y actualizar al reabrir/refrescar, sin polling oculto.
- Una comida sin hora fiable puede pertenecer a la ventana si su fecha lógica toca alguna fecha de Córdoba de la ventana o su hora incierta cae dentro. Se cuenta como incertidumbre y se ofrece su fecha para consultar; no se coloca artificialmente.
- Medianoche usa instantes y todas las fechas tocadas. Ventanas solapadas pueden mostrar el mismo registro en ambas sesiones; no hay asignación exclusiva ni observaciones analíticas nuevas. Mostrar solapamientos conocidos, sin afirmar exclusividad cuando faltan horarios.
- El contexto posterior no explica el rendimiento ya sucedido. Los valores previos conservan exactamente sus reglas publicadas; carbohidratos legacy no se corrigen silenciosamente.

Checkpoints, SHAs, validación y pendientes se agregarán al completar cada entrega. No declarar #367 terminado mientras persistan bloqueos metodológicos o QA.

## Checkpoint 1 — Contexto temporal preparado

- Vista optativa `session-temporal/1`, sin modificar respuestas existentes ni algoritmos publicados. Horarios de Córdoba, duración entre timestamps, contexto previo intacto, cobertura de 3 h y registro de la última hora explícita. Posterior con cuatro nutrientes, incertidumbre, provisionalidad, solapamientos y muestra de hasta 20 registros por bloque con conteo total y acceso a sus fechas originales.
- Mobile abre el detalle desde todas las sesiones del día, conserva día/sesión y revisión para el retorno desde Nutrición. Al volver a Insights se revalida la lectura completa. Vacío, error, lectura anterior identificada y reintento separados. No se monta al terminar ni en Inicio.
- **Pruebas:** raíz 47 únicas (4 temporales, 9 de ventanas previas, 6 de API de detalles y 28 de regresiones de API); Mobile 59 únicas (55 de contexto temporal/Insights/día/hechos de sesión y 4 de presentación previa). Tipos raíz/Mobile y lint aprobados. La validación Mobile completa se reserva para terminar la combinación.
- **PostgREST real:** `node scripts/testing/period-details-local.mjs --temporal-only`; PostgreSQL 17.6, PostgREST 16.5, las 93 migraciones, fixture sintética >1.000 filas y dos identidades bajo RLS. SQL independiente confirma totales posteriores, faltantes y límite superior excluido. La pila se eliminó. Se reutiliza el lector canónico exacto, sin consultas o joins nuevos.
- **Costo:** 9 consultas agrupadas en la fixture pequeña de API (1.492 bytes). En la fixture local de paginación: 13 consultas, 51 sesiones del día y 193.046 bytes. Esta última es un caso de estrés de varias sesiones, no una latencia representativa ni SLA. El detalle lee el historial fuente vigente al abrir: no agrega caché de fuentes ni finge que el costo es acotado solo al día. No calcula comparadores/asociaciones ni suma pedidos por sesión; la muestra acota filas de evidencia, no la cantidad de sesiones que se conservan.
- **Pendientes de la tanda:** exploración conjunta semanal y conexión del período (etapas 2–3); después #399 y #418 en ramas separadas. Login/JWT y QA física no se acreditan con el transporte sintético local. No se cerró #367.

## Checkpoint 2 — Semanas y recorrido del período preparados

- Vista optativa `period-explore`, versión `insights-week-explore/1`, con el mismo `asOf` y trimestre cerrado del resumen. Conserva todos los días y semanas, incluidos vacíos y bordes recortados. Una lectura conjunta carga comparaciones publicadas, coberturas ordinales de energía/fatiga al terminar, cuatro nutrientes, peso diario/medianas semanales existentes y métricas personales. Los denominadores completos y parciales permanecen separados; no hay promedios ordinales, score ni búsqueda de relaciones.
- Desde el resumen (también vacío) se abre la última semana; cambiar de semana es local. Día → sesiones/comparaciones → evidencia o contexto temporal y Nutrición/Cuerpo/métrica → regreso conserva fechas, semana y selección. El día antiguo se solicita con el cursor existente `before`, sin depender de los últimos 14 días. Al volver se revalida y se avisa si cambió la revisión. Se reutilizan los detalles de #421, sin reemplazar sus contratos.
- La proyección semanal solo transporta los conteos de entrenamiento; la evidencia detallada sigue en su lector existente. No se agregaron joins ni consultas por día. Fuente y pesajes se leen entre dos revisiones comunes y se reinicia toda la lectura una vez si cambia el contador. El lector fuente sigue paginando el historial, no solo el trimestre: su costo crece con el historial y no se presenta como consulta acotada por fecha.
- **Costo y lector real:** PostgreSQL 17.6, PostgREST 16.5, 93 migraciones; `node scripts/testing/period-details-local.mjs --weeks-only`. Fixture >1.000 filas: **14 consultas, 92 días, 45.039 bytes**. SQL independiente confirma mediana y nutrientes; parser compartido, paginación, RLS y revisión verificados. La pila descartable se eliminó. La primera forma repetía 1.758.410 bytes de hechos de sesión; la forma final evita esa duplicación sin recortar días ni muestras. No es un benchmark de producción.
- **Validación dirigida:** 46 pruebas raíz únicas (calendario/medianas/contrato, períodos, API legacy y API de detalles); la proyección compacta repitió únicamente sus 9 pruebas afectadas. Mobile: 55 pruebas únicas de semanas/contexto diario/período/temporal/Insights, incluyendo semanas vacías, cambio de semana sin lectura adicional, error/reintento, origen y revisión, y regreso desde dominios. Tipos/lint aprobados; validación Mobile completa reservada para cerrar la combinación.
- **Orden:** #424 apilado sobre #423; integrar primero el contexto temporal. #399 y #418 se prepararon independientemente desde main en #425 y #426. No se implementó Web, #402 ni asociaciones nuevas. QA física y validación metodológica siguen pendientes; #367 permanece abierto.

## Checkpoint final de la tanda — cuatro PRs borrador

- #423 `8b286f5`: contexto temporal. #424 parte de `a1be241`: semanas y navegación. #425 `b7c2ee7`: #399, relectura confirmada de Cuerpo. #426 `b4c4166`: #418, guardadas y resaltado. Los dos últimos tienen base main, sin depender de Insights; todos bloquean previews y se publican sin force. Los SHAs de cambios posteriores de documentación quedan en el historial de sus ramas.
- **Combinación local sin merge:** rama de comprobación no publicada `codex/367-combination-check`, `654a0c970a0bae7b8706f1a2ff0c9ec6a1427e7a`, aplicando los dos commits independientes sobre #424. No incorpora #420 ni archivos experimentales. Una sola ejecución de `npm run validate`: tipos y lint pasaron; **204 suites/1.698 pruebas pasaron y 1 suite/1 prueba falló**, de 205/1.699. Duración Jest: 199,644 s. Por tanto **la validación completa NO está aprobada**. `config:check` se ejecutó después por separado y pasó, porque la cadena se detuvo en Jest.
- Fallo: `session-return-dock.test.tsx`, «reads presence once across five quick route changes, and revalidates after a settled write», esperaba desaparecer el dock tras la relectura. Archivo y fuentes de presencia sin cambios en esta tanda. Se investigó con las tres suites relacionadas (dock, puente y store): **69/69 pasan sobre main `6d94f31` y 69/69 sobre la combinación**. Esto no demuestra la causa ni permite atribuir el fallo a main. No se alteraron expectativas, timeouts ni producto para fabricar una aprobación. Pendiente concreto: aislar la condición de la corrida amplia antes de acreditar ese gate; no se repitió la suite completa.
- Revisión final de navegación: conservar también la revisión de origen en el regreso día → semana y temporal → día → semana. Regresiones afectadas: **15/15**, tipos y lint aprobados. La prueba temporal adicional lleva a **56 pruebas Mobile dirigidas únicas** para la etapa semanal; no se repitieron suites ajenas.
- QA física sigue sin aprobar y Mobile no llega al teléfono sin build autorizada. La checklist única contiene las cuatro entregas. El producto permite investigar hechos/ventanas, no determinar qué causó una mejora o emitir asociaciones experimentales; #367 no se declara terminado.
