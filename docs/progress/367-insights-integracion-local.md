# Handoff — retomar #367 en un chat nuevo (2026-11-06)

**Para Claude o Codex.** Leer esto primero. No repetir auditorías ni pruebas ya hechas: lo vigente está acá.

## Estado real

- **`origin/main` = `96b4a63`** (merge de #411). Incluye todo lo de abajo.
- **Checkout `C:\Proyectos\Ownlevel`:**
  - en `codex/367-exercise-evidence` (`b6ad514`), limpio y ya mergeado;
  - la rama local `main` quedó en `1fe5715`, 3 commits detrás de `origin/main`;
  - **antes de trabajar:** `git status -sb`, luego `git switch main` y `git pull --ff-only`, y crear la rama nueva desde ahí.
- **Worktree sobrante:** `C:\Users\senes\AppData\Local\Temp\ownlevel-feelings-receipt`, en `codex/367-feelings-finish-receipt` (`c97bb3d`). Está limpio y ya mergeado; se puede quitar con `git worktree remove`.
- **Pendiente local o remoto:** la rama `codex/367-feeling-outcomes` (`721c27a`), publicada y **sin PR**. El navegador integrado no tiene sesión en GitHub: hay que abrir el borrador a mano, con el texto de `docs/progress/367-sensaciones-resultado-pr-description.md`. Ver «En curso».
  - El checkout está en esa rama, limpio.
  - No hay pilas locales de Supabase corriendo.
  - Esta rama de integración (`integration/367-insights-candidate`) solo guarda esta continuidad y no se mergea.
- **Notion:** no se actualizó (regla de AGENTS.md).

## En curso — energía y fatiga al terminar como resultados

Rama `codex/367-feeling-outcomes`, publicada en `721c27a` sobre main `96b4a63`. Previews bloqueadas. Sin migración ni cambios en las vistas existentes.

- **Implementado y publicado en la rama:**
  - método `insights-feeling-outcomes/1` (`feeling-outcomes.ts`). Unidad: día cerrado con una sola sesión. Captura: entre el inicio y 2 h después del final. Cada día se ordena dentro de su nivel previo del mismo tipo;
  - descripción en `view=feelings`, que sale del mismo snapshot;
  - pantalla Mobile «Cómo terminaste».
- **Implementado y sin publicar:**
  - las asociaciones, en un carril interno (`snapshot.feelingOutcomes[].lane`). Ninguna vista lo expone.
- **Validado:**
  - pasan 403 pruebas de Web y 46 de Mobile Insights; tipos y lint sin errores;
  - calibración nueva: 500 historiales por escenario, con resultados en `docs/progress/367-sensaciones-resultado-metodo.md` de esa rama. **No cumple el presupuesto:** con cambios de rutina da 7,2 % y con tendencias 6,2 %, y los nulos también quedan con cotas arriba del 1 %. El estrato frena una exposición que solo sigue a la previa (0 %, contra 100 % sin estrato).
- **Siguiente paso:** un método de asociaciones que pase esa calibración. Opciones en el documento de método: permutar dentro de cada era de rutina, cambiar la ventana de tendencia, o corregir los dos resultados en conjunto. Cada una es un método nuevo con su propia calibración.
- **Hoja de ruta:** [367-hoja-de-ruta-ecosistema.md](367-hoja-de-ruta-ecosistema.md), en la rama. Siguen alimentación y tiempo (tres candidatos iniciales), evolución corporal semanal y resúmenes de 3 meses. Todo es diseño.
- **Matriz y QA:** matriz corregida (#410, #411 y la configuración aplicada); sección nueva en la checklist única.

## Entregas integradas en main, hasta #411

- **#393 a #395, #397 y #398:** convención del sueño, peso del día, configuración del ejercicio y procedencia de la hora de comida. Mergeados y con sus migraciones aplicadas en producción. Detalle en [367-sueno-peso.md](367-sueno-peso.md) y [367-exercise-configuration-rollout.md](367-exercise-configuration-rollout.md).
- **#403:** contexto diario completo: todas las sesiones y los cuatro macros.
- **#404:** tendencias de peso enlazadas entre Insights y Cuerpo.
- **#405 y #406:** pesos en 0 kg e historiales completos de peso y medidas.
- **#407 y #408:** memoria del motor. El comparador tiene una salida compacta para Insights.
- **#409:** lectura en frío. Las series vienen embebidas, con una guarda de conteo y un stream de respaldo.
- **#410:** resumen factual post-entreno y vista de una sesión, con cada método por separado y la fecha de la referencia.
- **#411:** evidencia de comparación por ejercicio.
  - `view=evidence`: una lectura acotada a un ejercicio, con el comparador compartido en salida completa.
  - Pantalla «Evidencia» en Mobile: series con su número y su bloque, récord aparte, y nunca otra referencia en lugar de la tocada.
  - Prueba contra PostgREST local.

Ninguna de esas entregas de Mobile tiene build. La QA física no está aprobada.

## Leer antes de tocar código

**Leerlos en `main`:** esta rama de integración tiene copias más viejas de los documentos de `docs/progress/`.

1. `AGENTS.md` (o `CLAUDE.md`): reglas, marca y flujo.
2. [367-matriz-cobertura.md](367-matriz-cobertura.md): qué está accesible y qué no. Para la próxima etapa, las secciones «Sensaciones» y «Próximos incrementos».
3. [367-insights-partial-metodo.md](367-insights-partial-metodo.md): métodos, carriles, memoria y lectura en frío.
4. [367-qa-fisica.md](367-qa-fisica.md): la única checklist de QA, todavía sin aprobar.
5. Para UI: `docs/brand/ownlevel-marca/IDENTIDAD.md` y `tema/tokens.ts`.

**Código de entrada:**
- motor: `src/lib/progress/insights-engine/` (`read-model.ts`, `exposures.ts`, `associations.ts`, `source-adapter.ts`, `evidence.ts`);
- comparador: `src/lib/progress/performance-insights/`;
- contrato y loader: `src/lib/mobile-api/performance-insights-contract.ts` y `performance-insights-server.ts`;
- Mobile: `apps/mobile/src/insights/`.

## Validaciones vigentes (no repetir)

- **Web** (motor, comparador, contrato y ruta): 393 pruebas, más `performance-insights-evidence.local.test.ts` contra PostgREST local.
- **Mobile:** 1653 de 1657 en la suite completa, con tipos, lint y config limpios.
- **Fallos preexistentes, iguales en main:**
  - Mobile: 4 de `active-session-bridge-screen`;
  - raíz: `training-session.test.ts` «retains ownership, source validation…»;
  - `session-return-dock` puede fallar por carga.
- **Pruebas locales:** se activan con `OWNLEVEL_INSIGHTS_LOCAL_STATUS` y `OWNLEVEL_INSIGHTS_LOCAL_DB`. Solo con pilas descartables `ownlevel-receipt-<8hex>` y API en loopback.

## Límites y pendientes

- **«Consistente» sigue deshabilitado.** Sin causas, recomendaciones ni asociaciones nuevas.
- **#367 sigue abierto.**
- **Sin builds ni QA física** sin autorización expresa.
- **Migraciones remotas:** solo con autorización y siguiendo EXPAND → ADOPT → OBSERVE → CONTRACT.
- **Sin probar en local:** la relectura de una lista de series cortada. No puede ocurrir con `max_rows = 1000` y el límite de 50 series por bloque; queda cubierta por la prueba de la ruta.
- **Latencia:** no hay mediciones de producción de la lectura de evidencia.
- **Fuera de alcance por ahora:**
  - paginar por clave los valores diarios para la lectura en frío;
  - conexiones de ChatGPT instaladas, que deben refrescarse para tomar el esquema publicado.

## Siguiente etapa (iniciada en `codex/367-feeling-outcomes`, ver «En curso»): energía y fatiga posteriores como resultados independientes

**Hoy** (ver «Sensaciones» en la matriz):
- `energyPost` y `fatiguePost` se guardan en `workout_session_feelings` y se muestran como contexto de su sesión;
- no son candidato ni resultado: usarlas como antecedente invertiría el orden temporal.

**Objetivo:** publicarlas como resultados propios, separados del rendimiento. Nunca se suman, se promedian ni se combinan con él.

**Decisiones abiertas** (proponerlas antes de implementar):
- **unidad:** sesión o día. Un día con varias sesiones hoy se excluye de las sensaciones (`multiple_sessions_day`);
- **qué se compara:** la escala ordinal 1–5 sin promedios ni puntajes, o la proporción de días con un valor dado;
- **qué antecedentes:** cuáles valen sin invertir el tiempo (comida previa, sueño de la noche anterior, energía previa), con sus mismas reglas de ventana;
- **método:** si se necesita una versión nueva del motor o del contrato. Un resultado nuevo es una capacidad nueva: va en su propio PR y con su propia versión, nunca escondido en un cambio visual.

**Invariantes a conservar:**
- **Datos:** faltante ≠ cero; ilegible, tardía y sin registrar quedan distintas; la energía heredada (`energy_level`) nunca pasa a ser posterior.
- **Integridad:** sin texto causal; un fallo de lectura nunca se ve como un vacío.
- **Lectura:** la revisión de fuentes, sin consultas por tarjeta.

---

# Estado anterior — evidencia de comparación por ejercicio, mergeada en #411 (`96b4a63`)

Main `1fe5715` incluye #410. Rama `codex/367-exercise-evidence`, publicada en `37c681e`, con previews bloqueadas. Sin migración ni cambio de método. PR en borrador pendiente: el navegador integrado no tiene sesión en GitHub.

- **API:** vista `view=evidence` del contrato `performance-insights/1`, con sesión, ejercicio y método. Lee solo el historial de ese ejercicio bajo el mismo contador y corre el comparador compartido con salida completa. Sin clasificación propia, volumen, porcentajes ni e1RM.
- **Costo:** 3 pedidos por apertura (contador, una página de filas del ejercicio, contador), más uno solo si una lista de series vino cortada. Cálculo de 1,2 a 2,7 ms frente a 81 a 132 ms del snapshot completo, en la historia sintética. Ninguna lectura por fila de Insights.
- **Mobile:** las filas de ejercicio de un día o de una sesión abren «Evidencia». Muestra la referencia con su fecha, las señales, las series en su unidad, el récord aparte y los motivos de mezclado o sin comparar. Nunca pone otra referencia o resultado en lugar del que se tocó.
- **Equivalencia:** para cada ejercicio publicado en los dos carriles, mismo resultado, motivo y referencia que Insights, con el historial completo o solo el del ejercicio. Pasan 392 pruebas de Web y 51 de Mobile Insights. En la suite completa de Mobile, solo fallan las 4 preexistentes de `active-session-bridge-screen`.
- **Pendiente:** build de Mobile y QA física ([lista única](367-qa-fisica.md)).
- **Detalle:** [descripción del PR](367-evidencia-ejercicio-pr-description.md) en esa rama.

---

# Estado anterior — resumen factual post-entreno, mergeado en #410 (`1fe5715`)

Main `bd5407e` incluye #409. Rama `codex/367-post-workout-summary`, publicada en `40455116c2db996dc6b97c805add45f35cc9c235`, con previews bloqueadas. Sin migración ni cambio de método.

- **Resumen post-entreno:**
  - rotula que sus marcas son la regla de «la última vez con el mismo modo de carga», no la comparación de Insights;
  - muestra las sensaciones ordinales, antes → después, con su horario conocido;
  - no lee Insights al terminar.
- **Insights, vista de una sesión:**
  - cada método por separado con sus conteos;
  - «Mezclado» y «Sin comparar» separados;
  - fecha de cada referencia compatible (`referenceDate`, opcional en el contrato);
  - sensaciones ordinales con ilegible y tardía distintas.
- **Equivalencia:** 53 de 53 vistas idénticas a main sin `referenceDate`; pasan 376 pruebas del motor y 82 de Mobile.
- **Matriz:** estados corregidos con Git (#403 a #409 mergeados), sin aprobar QA.
- **Pendiente:** build de Mobile y QA física. El detalle de la sesión no trae la hora de la primera serie.
- **Detalle:** [descripción del PR](367-resumen-post-entreno-pr-description.md) en esa rama.

---

# Estado anterior — lectura en frío de Insights, mergeada en #409 (`bd5407e`)

Rama `codex/367-insights-cold-read`, ahora en `bbddaa6a6af65cee8fd923484b908c51a43ef88c` sobre main `03fc8f7`, con previews bloqueadas. Sin migración ni RPC.

**Corrección de la revisión:** PostgREST 16.5 corta también cada lista embebida en `max_rows`. Un padre con 1500 hijos recibe 1000; la versión anterior lo negaba.
- **Por qué hoy no se corta ninguna lista de series:** el esquema limita un ejercicio de sesión a 50 series (`workout_sets_set_number_check` con `workout_sets_unique_number`). La 51 es rechazada.
- **Control sin suponerlo:** un conteo único de series corre en paralelo. Si las listas suman menos, se lee el flujo de series paginado, como antes. Nunca una lista parcial, nunca un pedido por ejercicio.
- **Equivalencia:**
  - todos los ids de series de main y de la rama coinciden con SQL, con ejercicios de 50 series;
  - 8 de 8 hashes de fuente y vistas contra main;
  - pruebas locales nuevas de 50 series y de la serie 51 rechazada;
  - pruebas unitarias de listas cortadas.
- **Medición a 10 años, PostgreSQL 17.6:**
  - consultas: 162 → 98;
  - bytes: 34,8 → 31,1 MiB;
  - tiempo: 2361 → 2425 ms, sin mejora confiable.
- **Pendiente:**
  - paginar por clave para la latencia;
  - producción, no medida.
- **Detalle:** [descripción del PR](367-lectura-en-frio-pr-description.md) en esa rama.

---

# Estado anterior — salida compacta del comparador, mergeada en #408

Main `2eb08b1` incluye #407. Rama `codex/367-comparator-compact`, publicada en `67b3fb712d32780f8141379739ae919c07384439`, con previews bloqueadas. Sin cambios de método, contrato, caché ni RLS. La salida completa sigue siendo la predeterminada.

- **Qué hace:** con `output: "compact"`, el mismo recorrido y la misma clasificación (`classify`) entregan estado, motivo, referencia, récords y exclusiones. No entregan exposiciones con series, evidencia ni volúmenes. Solo Insights la pide.
- **Equivalencia:**
  - la compacta es la proyección exacta de la completa en 30 historiales desordenados, en todos los modos;
  - la salida completa coincide con main en 401 de 401 hashes;
  - las vistas de Insights coinciden en 53 de 53.
- **Memoria a 10 años, método 2:**
  - pico residente: 213,7 → 169,8 MiB;
  - piso de heap: 180 → 135 MiB.
- **Sin cambio:** memoria retenida, tiempo, consultas y respuestas.
- **Límite:** 170 MiB sigue por encima del presupuesto de 128. Bajar más requiere recorrer la historia por partes, un cambio de arquitectura del comparador que queda pendiente.
- **Detalle:** [descripción del PR](367-comparador-compacto-pr-description.md) en esa rama.

---

# Estado anterior — memoria del motor de Insights, mergeada en #407

Main `f53fae0` incluye #406. Rama `codex/367-insights-memory`, publicada en `640f0e759ae78366f48b3b54e9dd12a42300152c`, con previews bloqueadas. Solo `read-model.ts` y tipos de `exposures.ts`. Sin cambios de método, contrato, caché ni RLS.

- **Qué cambia:**
  - cada comparador se reduce a sus hechos publicados antes de que corra el siguiente;
  - las sesiones adaptadas no sobreviven a los comparadores;
  - cada carril guarda solo filas, candidatos y sesiones por día.
- **Equivalencia:** 53 de 53 hashes de todas las vistas, páginas y detalles de relaciones iguales, más una prueba dirigida y las 296 del motor.
- **Memoria a 10 años, método 2:**
  - piso de heap: 220 → 175 MiB;
  - retenida por instantánea: 15,5 → 13,1 MiB.
- **Sin cambio:** pico residente (unos 213 MiB), tiempo dentro del ruido, consultas (268) y respuestas.
- **Pendiente:** un modo del comparador que no materialice evidencia, propuesto y no hecho. La lectura en frío y el detalle de 258 KiB siguen igual.
- **Detalle:** [descripción del PR](367-insights-memoria-pr-description.md) y [metodología](367-insights-partial-metodo.md), en esa rama.

---

# Estado anterior — historial completo de medidas corporales, mergeado en #406

Main `236a3e4` incluye #404 (tendencias de peso) y #405 (pesos en 0 kg e historial de peso completo).

Rama `codex/367-body-measurements-history`, publicada en `45def1b6b95af5f3330ff1642b3148659c21aa30` sobre ese main, con previews bloqueadas. Solo servidor y Web: sin migración, sin cambios de contrato de Mobile y sin tocar Insights.

- **Qué corrige:** `listBodyMeasurements(1000)` leía las 1000 mediciones más viejas. Ahora `listAllBodyMeasurements` lee todas por páginas de `(measured_on, id)`. Lo usan Cuerpo en Web, el informe de Mobile, Inicio y Relaciones.
- **Cursor:** el esquema mantiene una medición por usuario y fecha. El id desempata igual, así que una fecha repetida tampoco se saltea ni se repite.
- **Sin cortes ni vacíos falsos:** termina con una página vacía, falla pasado el máximo y una falla nunca se lee como historial vacío.
- **Sospechosas:** siguen excluidas y contadas.
- **Validación:** 6 regresiones nuevas y 330 pruebas afectadas pasan, con tipos y lint sin errores.
- **Detalle:** [descripción del PR](367-medidas-historial-pr-description.md) en esa rama.
- **Estado:** #367 sigue abierto.

---

# Estado anterior — correcciones de peso en Cuerpo, mergeadas en #405

Rama `codex/367-body-weight-fixes`, publicada en `cc84221b4e59d4f04d7746bdb8241e3c19357e59` sobre main `8dd3d01`, con previews bloqueadas. Separada de #404. Sin migración ni cambio de contrato de Mobile; Web y servidor.

- **0 kg:**
  - Una sola regla, `isValidBodyWeightKg` (mayor a 0). Saca el 0 kg del gráfico, del cambio, de la comparación, de las relaciones y de Etapas.
  - Conserva el registro, lo cuenta (`excludedInvalidWeightCount`) y lo muestra en Web.
  - Web, la API de Mobile y el formulario de Mobile rechazan los 0 kg nuevos.
  - Corregir o borrar un 0 kg sigue funcionando.
- **Historial de más de 1000 pesajes:** `listAllWeightHistory` lee todo por páginas de fecha, termina con una página vacía y falla en vez de truncar. `listWeightHistory(limit)` ahora devuelve los más recientes.
- **#404 ajustado** (`363deb35289c4987f63ee674a9e5da31d3db7d33`): su aviso de 0 kg es correcto con y sin esta corrección. Probé el merge local de las dos ramas, sin conflictos, y lo descarté.
- **Pendiente:**
  - restricción de base `weight_kg > 0`, que requiere migración;
  - `listBodyMeasurements`, con el mismo límite de 1000.
- **Detalle:** [descripción del PR](367-peso-correcciones-pr-description.md) en esa rama.

---

# Estado anterior — tendencias de peso, mergeadas en #404

Rama `codex/367-weight-trends`, publicada en `dfbd06c1f6727b384650f0af22442a1c8edadbe5` sobre main `8dd3d01` (#403 mergeado), con previews bloqueadas. Solo Mobile: sin migración, backend ni cambio de método. Sin mergear ni build.

- **Qué hace:**
  - El peso del día en Insights abre Cuerpo en el mes de ese día.
  - La relación de peso abre el tramo de sus días.
  - Cuerpo aplica ese período antes de leer y aclara que el peso de un día no dice cuándo se pesó respecto del entrenamiento.
  - Cuerpo fecha la referencia del cambio, nombra los pesajes en 0 kg y vuelve a la misma sesión, día o relación de Insights.
- **Reutiliza:** las tendencias descriptivas que Cuerpo ya tenía.
- **Propuestas de backend, sin implementar:**
  - excluir del informe de Cuerpo los pesajes en 0 kg, que Insights ya trata como inválidos;
  - leer los pesajes más recientes primero: hoy `listWeightHistory` corta los 1000 más viejos.
- **Detalle y validación:** [descripción del PR](367-tendencias-peso-pr-description.md) en esa rama.
- **QA física:** diferida, en la [lista única](367-qa-fisica.md).
- **Estado:** #367 sigue abierto.

---

# Estado anterior — contexto diario completo, mergeado en #403 (`8dd3d01`)

Rama `codex/367-day-context`, publicada en `effbd7dbcb7fbfe8e40d76b806e0910cb4849a49` sobre main `71c7dd3`, con previews bloqueadas. Sin migración, sin mergear ni build.

- **Qué hace:** en Mobile, el contexto del día muestra todas sus sesiones y los cuatro macros registrados. Cada sesión tiene nombre, horario, sensaciones antes y al terminar y carbohidratos de 3 h. Lo del día aparece una sola vez.
- **Método:** sin cambios. Mismas exclusiones `multiple_sessions_day`, los mismos candidatos, ventanas, denominadores y versiones.
- **Contrato:** agrega el campo opcional `sessions[].context.unreadableFeelings`, sin consultas nuevas. Los clientes anteriores lo ignoran.
- **Detalle y validación:** [descripción del PR](367-contexto-diario-pr-description.md) en esa rama.
- **QA física:** diferida, en la [lista única](367-qa-fisica.md).
- **Próximo:** tendencias de peso. #367 sigue abierto.

---

# Estado vigente — sueño y peso desplegados

#397 y #398 están mergeados y desplegados en READY. Main: 71c7dd3c1240fb221486190a0ebb65bd6a80f22b. Ver [registro vigente](367-sueno-peso-rollout-produccion-2026-11-06.md). Lo siguiente conserva el historial de preparación y sus estados anteriores.

---

# Estado vigente — variantes desplegadas, 2026-11-05

#393, #394 y #395 están mergeados y desplegados en READY. La migración efectiva es 20261105223915, con SQL intacto. Ver [registro de cierre](367-variantes-rollout-produccion-2026-11-05.md). QA física y OBSERVE siguen pendientes. El contenido siguiente conserva el historial de preparación y sus estados anteriores.

---

# Estado vigente — rollout 2026-11-05

Los cinco PR se mergearon y las migraciones ya están aplicadas. Ver [registro de producción](367-rollout-produccion-2026-11-05.md) para SHAs, versiones efectivas y límites. Lo que sigue es el registro histórico de preparación; sus estados de «sin aplicar» describen esas corridas anteriores.

---

# #367 — Integración local de Insights

Rama `integration/367-insights-candidate`, publicada y con sus previews bloqueadas. Sirve para revisar la combinación, no para mergearla: cada PR entra por su cuenta. `integration/367-insights-local` queda en `e570011da8afd0bbc9ee01b6add34de5a4d601c3` como checkpoint. El detalle de cada cambio está en la descripción de su PR.

## Estado de la entrega

Registro de la ejecución autónoma del 2026-11-05. El índice del mapa de código devolvió vacío, así que todo sale del checkout y de GitHub.

### Plan

| Tarea | Depende de | Acepta si | Estado |
| --- | --- | --- | --- |
| #380 en el candidato | Nada | Conflictos unidos, tipos y pruebas, sin deploy | Hecho |
| Merge de #380 y #383 | Backend en producción | Tipos, lint, pruebas y deploy `READY` | Hecho |
| Merge de #385 y #386 | Sin esquema nuevo | Ídem | Hecho |
| Conexiones y filas de #390 | #386 | Conexiones cubiertas, pruebas y merge | Hecho |
| Mejora de escala | #390 | Medido y sin perder datos | Parcial: ver abajo |
| Paquete de migraciones | #387, #391 | Listo para decidir | Hecho |
| Migraciones y sus consumidores | **Autorización** | Paquete | **Bloqueado** |
| QA física | **Indicación** | [Lista única](367-qa-fisica.md) | **Pendiente** |

### Pull requests

| PR | Estado | Head | En `main` | Producción |
| --- | --- | --- | --- | --- |
| #380 | Mergeado | `24af8ca` | `31cbfd7` | `dpl_CuAkVrT…`, `READY` |
| #383 | Mergeado | `d6332f3` | `d777bfb` | `dpl_Ca8p49X…`, `READY` |
| #385 | Mergeado | `5e95a17` | `4d0f58e` | `dpl_9bFGSWR…`, `READY` |
| #386 | Mergeado | `1deaef4` | `c0df3bd` | `dpl_2H9SeWx…`, `READY` |
| #390 | Mergeado | `5e8a74a` | `26081d9` | `dpl_5rSQ6hj…`, `READY` |
| #387 | Bloqueado por su migración | `238cffe` | No | No |
| #388 | Bloqueado: el `INSERT` de Web falla sin la columna | `4b9f69a` | No | No |
| #391 | Bloqueado por su migración | `aff664c` | No | No |
| #392 | Bloqueado: responde 503 sin la tabla | `57894ad` | No | No |
| #389 | Bloqueado: responde 503 sin la columna | `70c188a` | No | No |

Paquete para decidir: [autorización de migraciones](367-autorizacion-migraciones.md).

### Cómo se mergeó
No hay sesión de GitHub en esta máquina: ni `gh`, ni navegador autenticado, ni Claude in Chrome conectado. `git push` sí funciona, y `main` no tiene protección ni checks requeridos. Por eso cada merge fue un `git merge --no-ff` publicado a `main`, de a uno, sin force y después del deploy anterior. GitHub los registró como mergeados.

- **Quedan marcados como borrador** en GitHub, aunque mergeados, porque sacarlos de borrador requiere sesión.
- **#386 y #390 tenían base apilada.** Avancé esas bases con un fast-forward para que GitHub los registre. Por eso `codex/367-insights-pr4-engine` y `codex/367-insights-partial-method` ya no están en sus heads originales.
- **Descripciones:** no se pudieron editar en GitHub. Las versiones nuevas están en `docs/progress/`, en cada rama.

### Correcciones en #390
- **Filas:** con `fontScale > 1.3`, varias filas apretaban etiqueta y valor y cortaban nombres, contra la regla de marca. `InsightRow` las apila y no corta.
- **Escala:** ver abajo.

### Escala a 10 años

| | Antes | Ahora |
| --- | --- | --- |
| Detalle de una relación | 258 KiB | **10,9 KiB**, con los 60 días más nuevos. Sus números cuentan todos los días |
| El mismo detalle, con todos los días | 258 KiB | 258 KiB, a pedido |
| Pico de memoria | 210 MiB | 209 MiB. **Sin resolver** |
| Lectura en frío, con ADOPT | 268 consultas | 268. **Sin resolver** |

Medido con el perfil sintético de 10 años, método parcial, sin calibraciones nuevas.

**Propuesta para memoria y lecturas. Requiere una decisión, no se implementó:** una tabla de hechos diarios por cuenta, escrita en un EXPAND propio y mantenida con el contador de #391. El motor leería días ya resumidos en lugar de cada serie. Baja las dos cosas, pero agrega una copia que puede divergir y una migración con backfill, así que antes conviene medir con el historial real, que no leí.

### Validación de esta ejecución

**Sobre `main`, antes de cada merge:** tipos raíz y Mobile, lint y pruebas de lo afectado. Con #383, la suite de entrenamiento de Mobile da 5 fallos: los 4 de `active-session-bridge-screen.test.tsx` son idénticos en `31cbfd7`, sin #383; el de `session-return-dock.test.tsx` ya estaba registrado y solo falla en conjunto. Producción: sin errores de runtime en las últimas 2 horas, `/login` 200 y rutas nuevas 401 sin token. **No se ejecutó ningún finish ni escritura en la cuenta real.**

**Sobre Postgres 17.6.1.105, la versión de producción, con el candidato en `83d4458`:** ver el paquete. Es lo que más cambia la evidencia anterior, que era de 17.11.

**Heads de #387, #388, #389, #391 y #392, después de incorporar `main`:** tipos raíz y Mobile y pruebas unitarias de cada uno. Sus migraciones no cambiaron de blob.

### Rollout sin conflictos

Se pidió resolver conflictos que GitHub marcaba en los cinco PR. **Al revisar, la API no los marcaba:** daba `clean` en #388, #389, #391 y #392, los cinco tenían `main` incorporado, y #387 figuraba `unknown`, con su referencia de merge sin recalcular desde un head viejo. **Los problemas reales aparecían al mergearlos uno detrás de otro:**

| Problema | Cuándo | Corrección |
| --- | --- | --- |
| Conflicto en `vercel.json` | #391 después de #387 o #388 | Bloque idéntico en #387, #388, #391 y #392 |
| Clave duplicada en `vercel.json`, sin conflicto | #392 después de #391 | El mismo bloque |
| Conflicto en los imports de `performance-insights.local.test.ts` | Entre #392 y #389 | Imports de #389 en otra línea |
| Test que fallaría, sin conflicto: `14 + 7` consultas y sin reutilización | #389 con #392 | #389 ya no fija costo ni reutilización |

**Verificado:** merge secuencial simulado en cuatro órdenes, sin conflictos y con un único árbol. El candidato difiere de ese árbol solo en sus archivos propios: este registro, el paquete, `insights-integration.local.test.ts` y su entrada en `vercel.json`. Blobs de las migraciones sin cambios. Sobre el candidato: tipos raíz, lint de los tests tocados y 131 pruebas sin base de datos, con 138 omitidas por requerirla. **No se repitió ninguna suite de PostgreSQL ni la de Mobile:** no cambiaron SQL, consultas, contratos ni código de la aplicación.

### Bloqueos

| Bloqueo | Motivo | Quién |
| --- | --- | --- |
| Migraciones de #387 y #391 | Sin autorización para producción | Vos |
| Sus consumidores: #388, #389 y #392 | Dependen de ellas | Después de eso |
| Descripciones y estado de borrador en GitHub | Requieren sesión de GitHub | Vos, o con sesión |
| Cerrar #367 | Faltan migraciones, ADOPT, OBSERVE, QA física y la decisión sobre el presupuesto del 1 % | Sigue abierto |

## Commits integrados

Sobre `origin/main` en `b5e57e3d1a6fc19c439e81161fff20de1c00388a`, en este orden:

| PR | Commit | Merge local |
| --- | --- | --- |
| #387 | `b8f00770735bf05a00c18e2424771524a3babcbf` | `4eca363` |
| #388 | `f1d48ce0e0df6c511d76c94240d7e3371de54162` | `3ad90c6` |
| #383 | `d6332f3c832ee1526a7fe0892a113284b6340f5f` | `71f8da4` |
| #385 | `5e95a17ba07feaea48d967ca5b3f6d947a42a4d7` | `74085be` |
| #386 | `1deaef496f3a96586b407435a7150e2c1f004251` | `71ebe61` |
| #389 | `238b13144a8019e5745f1c3c14e04fa88f8882c1` | `dae3c81` |
| #390 | `6981f0d1569bd9200af7358a8bf1edcae6f05b92` | `eacf304` |
| #391 | `567200269112ca381037f79aa2f9a4172a3af973` | `dcfcf40` |
| #392 | `e39182377bbbdb23b6a95b9a170bb58474f5a1bd` | `79f6f06` |

El candidato suma, sobre el checkpoint:

| PR | Commit | Merge local |
| --- | --- | --- |
| #391 | `d20ff7885ed43237492baa76861b7f30720d3ba5` | `d65ca5b` |
| #392 | `5065a987364f98265ca0f1b0f88f4a9aff305360` | `029a62a` |

Después se integraron #380 y `main`. En `metrics-trends-screen.tsx`, `progress-screens.test.tsx` y `vercel.json` quedan juntos los dos lados: selección de barras sin abrir Día, enlace desde Insights con retorno y todos los bloqueos de previews.

## Conflictos resueltos

- **`vercel.json`** (#385, #386, #391, #392): unión de los bloqueos. Quedan 11 ramas.
- **`performance-insights.local.test.ts`** (#392 contra #389): se conservan los imports de los dos. La cadena de comidas de #389 pasa a esperar la lectura de #392.
- **`performance-insights-server.ts`**: sin conflicto de texto. Queda la lectura por contador de #392, sin las 14 consultas de revisión.

Al actualizar el candidato chocaron la migración, la suite de cruce, las dos descripciones de la revisión y su documento. En todos queda la versión publicada. Las resoluciones de arriba no se tocaron: el merge no cambia `vercel.json`, `performance-insights.local.test.ts` ni `performance-insights-server.ts` respecto del checkpoint.

Sin conflicto de texto, pero revisados: `post-workout-screen.tsx` (#383 y #390) y `apps/mobile/src/api/performance-insights.ts` (#389 y #390).

## Conteos de consultas

| Caso | Antes (#389) | Combinación final |
| --- | --- | --- |
| Lectura en frío, por página de cada fuente | `14 + 7` | `2 + 7` |
| Segunda lectura sin cambios | `14 + 7` | `1`, mismo resultado |
| Lectura después de registrar una comida | `14 + 7` | `2 + 7`, revisión nueva |

## Candidato actualizado

**La migración es la publicada, byte a byte:** el blob `25181ddd08295d1c143ba9771d739dcd9150f40e` es el mismo en `d20ff78` y en el candidato. Frente al checkpoint agrega las revocaciones de `insights_source_pending` y su secuencia.

### Corrido sobre el candidato
Base local descartable con todo el esquema integrado, en el orden de abajo:

| Suite | Árbol | Resultado |
| --- | --- | --- |
| `performance-insights.local.test.ts` de #392 | `5065a98`, exacto | 5 pasan, 1 omitida (escala) |
| `performance-insights.local.test.ts` del candidato | Candidato | 6 pasan, 1 omitida (escala) |
| `insights-integration.local.test.ts`, 5 casos | Candidato | 5 pasan |

La corrida de `5065a98` usó un esquema con más que lo que #392 necesita: también tenía la procedencia horaria.

Los 5 casos, con lo que comprueban:

| Caso | Recibo | Contador | Sin efectos parciales | Invalidación |
| --- | --- | --- | --- | --- |
| Finish con respuesta perdida | Misma clave, misma respuesta, sin segunda escritura | +1, y la otra cuenta no se mueve | Una sola fila agregada a la rutina | Revisión nueva y lectura reutilizada en 1 consulta |
| Corrección, sensaciones, comida y descarte | Reejecución de la corrección sin efecto | +1 por cada uno; una versión vieja no lo mueve | `SESSION_CHANGED` no cambia nada | Revisión nueva tras cada cambio; `2 + 7` consultas tras corregir |
| Finish frente a rutina retenida que confirma | 3 resultados por ejercicio | +2 | La retención y la métrica quedan; orden `1,2` | Lectura nueva con la sesión |
| Finish frente a rutina retenida que hace rollback, caso nuevo | 3 resultados por ejercicio | +1 | La retención y la métrica no quedan; orden `1,2` | Lectura nueva con la sesión |
| Finish, 4 movimientos de rutina y 8 métricas a la vez por PostgREST | 3 resultados por ejercicio | +9, uno por commit | Sin errores, órdenes `1,2` y cada métrica con un valor de sus escritores | Lectura nueva con la sesión |

Los casos de rutina retenida y de escrituras a la vez se reforzaron para comprobar recibo, efectos parciales e invalidación, que antes no miraban. Los dos últimos, además, que `insights_source_pending` queda vacía.

### Errores del servidor en esta corrida
Log de Postgres y de Kong, desde que se aplicó la migración. **0 deadlocks y 0 respuestas 5xx.** Los 8 errores de Postgres son rechazos que las pruebas provocan y comprueban:

| Error | Veces | Respuesta | Origen |
| --- | --- | --- | --- |
| `permission denied for table insights_source_revisions` | 2 | 401 | Lectura anónima, una por cada corrida de la suite de ADOPT |
| `meal time evidence is written by the server` | 5 | 403 | Escrituras directas de procedencia, en la cadena de comidas |
| `SESSION_CHANGED` | 1 | 409 | Corrección con una versión vieja |

Al terminar: 0 notas, 0 posiciones duplicadas en vistas, rutinas y sesiones, 0 transacciones abiertas y 0 bloqueos de aviso.

### Acreditado sobre el mismo contenido, sin repetir
- **Con la migración `25181dd`, en #391 y sin la procedencia:** revisión 42, cruce 29, recibo 35, limpieza, reinicio y caída. Incluye una copia de los 6 casos de constraints diferidos que quedan omitidos en la suite integrada.
- **En el checkpoint, sin las revocaciones:** procedencia 46, y la campaña de 75 rondas.

### Límites
- Una sola corrida de cada caso. Los concurrentes dependen del momento: pasar una vez no prueba que no exista otra intercalación.
- **No es una garantía general de ausencia de deadlocks.** El orden de la cola es lo observado en PostgreSQL 17.11.
- Base local sin carga real, sin réplicas y sin restauración a un punto en el tiempo. Falta OBSERVE.
- La lectura de escala se omitió. Siguen sin resolver a 10 años el detalle de una relación, el pico de memoria y el costo de lectura en frío.
- `meal-time-provenance` y el recibo no corrieron sobre esta combinación exacta de procedencia y revocaciones.
- La QA física está diferida.

## Verificación del checkpoint

Base local descartable, con migraciones aplicadas en el orden de abajo:

| Suite | Resultado |
| --- | --- |
| `meal-time-provenance.local.test.ts` | 46 pasan |
| `insights-source-revision.local.test.ts` | 42 pasan |
| `performance-insights.local.test.ts` | 6 pasan, 1 omitida (escala) |
| `insights-integration.local.test.ts`, nueva | 10 pasan |
| `training-feelings-finish-local.mjs --test` | PASS, 35 comprobaciones |

La suite nueva cubre finish con respuesta perdida y recibo por la misma clave, la corrección real `mobile_correct_completed_session`, edición de sensaciones y de comida, descarte y convivencia con los constraints diferidos.

## Convivencia con los constraints diferidos

Son tres, no dos: también `workout_session_exercises_unique_order`.

| Caso, con commits reales | Resultado |
| --- | --- |
| Orden de rutinas, dos escrituras a la misma posición | La segunda espera el bloqueo por usuario antes del commit. `23505`, sin deadlock |
| Intercambio de posiciones y fuente en una transacción | Confirma, el contador sube 1 |
| Alguien tiene el contador | Rutinas y vistas no esperan. Otro commit con fuentes sí, y termina |
| Finish que suma a la rutina frente a una rutina retenida | Espera al inicio, y ambos confirman |
| Finish, rutinas y métricas a la vez por PostgREST | Sin errores, contador exacto |
| Cruce: fuente y misma posición, en vistas y en orden de sesión | La segunda espera sin tener el contador. Uno confirma y el otro recibe `23505`, sin deadlock |
| El mismo cruce de vistas sin fuentes | Espera y `23505`, sin deadlock |

Con la primera versión de #391 ese cruce daba `40P01`. La sección siguiente cuenta por qué y cómo se cerró.

## Cruce con token

**Es alcanzable con un token: era un bloqueo de #391.** Corregido y publicado en `d20ff78`. Las tablas de esta sección son del checkpoint, salvo donde se indica.

Cada request de PostgREST es una transacción: `BEGIN`, una sentencia y `COMMIT`, leído del log del servidor. Con la migración de #391 en `567200269112`:

| Operación con token | Clase | Resultado |
| --- | --- | --- |
| `PATCH` de `exercise_order`, otro token o sin token | Sin efecto | 200 sin filas: la RLS no las muestra |
| `POST`, `PATCH` y `DELETE` sobre `progress_views` | Rechazada por permisos | 403, `42501` |
| `mobile_reorder_progress_views` cruzada | Termina sin deadlock | El segundo espera al inicio y recibe `40001`. El contador no se mueve |
| `PATCH` de una fila a la misma posición, con gancho y sin él (300 pares) | Termina sin deadlock | Un ganador, 409 con `23505`. El recheck va antes que el contador en la cola |
| `PATCH` de dos filas de sesiones distintas, con gancho | **Permitida, da `40P01`** | 500. El ganador depende del momento, y cada transacción es entera o nada |
| El mismo `PATCH` frente a uno de 4001 filas, sin gancho, 100 ms después | **Permitida, da `40P01`** | **9 de 15 rondas** |

Las funciones que escriben vistas no escriben fuentes y se ordenan por usuario, así que ese cruce queda solo para quien escribe sin pasar por ellas: no es alcanzable con token.

El `PATCH` directo no es un camino de los clientes: Web y Mobile usan funciones que bloquean la sesión primero. Pero el permiso existe y lo usa cualquiera con su propio token. Solo se afecta a sí mismo.

### Corrección
Dos pasadas en `insights_source_changed`: ver el encabezado de la migración. Es un cambio sobre un archivo aún no aplicado en producción.

- **Una primera versión no sirvió:** `SET CONSTRAINTS ... IMMEDIATE` desde el trigger. En un commit los eventos ya están marcados y no adelanta nada. El deadlock seguía.
- **Otra versión tuvo costo cuadrático:** borrar cada nota buscándola entre las de la transacción llevó el `PATCH` grande a 2,4 s por ronda. Por eso se borra por id.

Resultado con la corrección:

| Prueba | Antes | Ahora |
| --- | --- | --- |
| Dos filas con gancho, 200 ms y 1500 ms | `40P01` | T1 confirma, T2 recibe 409 `23505`. T2 entera sin aplicar, contador +1 |
| 4001 filas sin gancho, 100 ms | 9 `40P01` en 15 rondas | 0 en 75 |
| 4001 filas sin gancho, 30 ms y 200 ms | 0 en 15 cada una (sin ventana) | 0 en 15 cada una |
| Cruces de vistas y de sesión desde `psql` | `40P01` | `23505` |
| Tiempo por ronda de 4001 filas, 200 ms | unos 320 ms | unos 375 ms |

Las suites de revisión (42), lectura (6 + 1 omitida), integración (10), cruce con token (15) y recibo (35 comprobaciones) pasan sobre esta versión. La de procedencia (46) no se repitió: no toca estos objetos. No se midió con carga real.

La prueba `sin gancho` depende del momento: 0 deadlocks con la corrección se explica por el orden de la cola, no por esas rondas. Las pruebas con gancho sí fuerzan el cruce en cada corrida.

### Reproducir
El gancho existe solo en la base descartable: frena una request después de escribir y antes de confirmar. No escribe nada ni toma bloqueos del producto.

```bash
export OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=supabase_db_ownlevel-receipt-<8 hex>
npx vitest run src/lib/mobile-api/insights-token-crossing.local.test.ts
```

Para ver el fallo, aplicar antes la versión anterior: `git show 567200269112:supabase/migrations/20261104190000_insights_source_revision_expand.sql`.

Los dos requests, con `$SHARED` el ejercicio de las 4001 filas y `$HEAD` y `$TAIL` dos filas de sesiones distintas, una de ellas en la sesión de una de esas filas:

```bash
curl -X PATCH "$API/rest/v1/workout_session_exercises?exercise_id=eq.$SHARED&select=id" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"exercise_order":3000}' & sleep 0.1; curl -X PATCH "$API/rest/v1/workout_session_exercises?id=in.($HEAD,$TAIL)&select=id" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"exercise_order":3000}'; wait
```

## Fallos separados de main

Mismos fallos en esta rama y en `b5e57e3`:

- `training-session.test.ts`: `retains ownership, source validation…`.
- `active-session-bridge-screen.test.tsx`: 4 pruebas.
- `session-return-dock.test.tsx`: 1 prueba. Falla al correr el conjunto en las dos ramas y pasa sola.
- `active_session_add_to_routine.sql`, `active_session_append_empty.sql` y `m3_3b_active_session.sql`: igual con y sin #391. Comparadas en la entrega anterior, no contra main.
- Lint: la advertencia de `meal-rpc.ts` ya está en main.

## Orden de migraciones, backend y adopción

Producción está en `20261104024300_training_feelings_finish_receipt` (lectura del historial del 2026-11-05). Lo que sigue es el orden original; el vigente, con lo ya mergeado, está en [el paquete](367-autorizacion-migraciones.md).

1. **Migraciones**, en este orden: `20261104180000_meal_time_provenance_expand`, `20261104190000_insights_source_revision_expand`.
2. **Backend EXPAND:** #387 y #391.
3. **Motor:** #385 y #386, y enseguida #392 y #389. Quien entre segundo entre estos dos lleva la resolución de la prueba local.
4. **Adopción de clientes:** #388 y #383. ChatGPT es un paso manual: reimportar el esquema y agregar `time_stated_by_user`.
5. **UI:** #390, con su build de Mobile. Recién ahí se expone Insights.
6. **OBSERVE:** 503 de Insights, errores `40P01`, duración de commits y aciertos de reutilización.

Solo se probó #387 antes que #391. No se probó con carga real.
