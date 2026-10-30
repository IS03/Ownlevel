# Optimización de infraestructura · 30/10/2026

Estado, mediciones y propuestas pendientes de este lote. Etiquetas: **[medido]** dato observado; **[estimado]** cálculo sin medición directa; **[sin confirmar]** hipótesis que los datos no prueban.

## Cambios integrados

| PR | Capa | Cambio | ¿Requiere actualizar Diario? |
|---|---|---|---|
| #343 | Servidor (proxy) | El proxy ya no se invoca en `ownlevel.fit` / `www.ownlevel.fit` fuera de las páginas de sesión. Previews y `*.vercel.app` conservan la protección de previews en todas las rutas | No |
| #344 | Mobile | Inicio refresca al volver a primer plano solo si está visible | **Sí, pendiente.** Diario instalado: `99fd0a1` (29/10 23:36:44 ART), anterior a #344 |
| #347 | Servidor | El Resumen de Progreso lee Nutrición una vez para el período actual y el anterior (rango unido, cortado por fecha) en lugar de dos | No |
| #350 | Mobile | Entrenar lee solo los meses que muestra y relee al volver a primer plano solo si está visible | **Sí, pendiente** (igual que #344) |

Mediciones:

- **[medido, simulador contra producción]** #344: una vuelta a primer plano con Entrenar en pantalla pasa de 14 lecturas a 7. Desaparecen las 7 de Inicio oculta, incluido `/progress/training` (historial completo).
- **[medido, `next dev` con `Host` variable]** #343: en el dominio de producción, `/api/mobile/*` y los archivos estáticos ya no pasan por el proxy; `/login` y las páginas de sesión sí. En producción, después del deploy:
  - `/home` y `/train` sin sesión → 307 a `/login`;
  - API sin token → 401;
  - `/sw.js` y el manifest → 200;
  - lecturas reales de la app → 15/15 con 200.
- **[medido, preview real de #343]** Sin autorización, `/login`, la API, `/mcp` y `/sw.js` → 302 al login de Vercel. Con autorización (enlace temporal de Vercel), `/login` → 200 pasando por el proxy. El bloqueo propio de OAuth (`OWNLEVEL_OAUTH_PREVIEW_LOCKDOWN`) solo está configurado para la rama `codex/ownlevel-oauth-mcp`: con el matcher nuevo lo cubren pruebas unitarias y `next dev`, no un preview.
- **[medido, logs de Supabase]** #347: una apertura de la app pasó de 8 a 7 llamadas a `mobile_read_nutrition_report`, todas 200. El Resumen lee un solo rango (01/09–30/10).
- **[medido, logs de Supabase]** #350, apertura de Diario `99fd0a1` del 30/10, 16:21:14 UTC. Los tres `/training` simultáneos piden meses distintos (septiembre, octubre y noviembre), y cada uno relee la sesión en curso: no son duplicados que la deduplicación haya dejado pasar. La segunda ronda, 12 s después, es la relectura tras la comida rápida confirmada a las 16:21:22. Se conserva.
- **[medido, mocks]** #350, lecturas de Entrenar al 30/10 (inicio + `/training` + semana):
  - carga, primer plano visible y foco tras una escritura: 5 (3 `/training`) → 3 (1);
  - primer plano con Entrenar oculta: 5 → 0.
- **[medido]** Filtro de builds (#339): el merge solo móvil de #344 quedó «Canceled by Ignored Build Step» en producción.
- **Sin medir:** el efecto en CPU de Vercel de #343 y #347. Ver «Vercel · Usage».

## Vercel · Usage (captura del 30/10, 13:47–13:49 hora del teléfono)

**Filtros:** cuenta completa (Team Usage, 4 proyectos), plan Hobby, «Last 30 Days» = **Sep 30, 10 a.m. – Oct 30, 10 a.m.** La captura no muestra la zona horaria de la ventana ni de las barras diarias. Panel «Updated 2m ago».

### Totales de la ventana [medido]

| Métrica | Valor |
|---|---|
| Fluid Active CPU | **3h 47m / 4h** (margen: 13 min con el redondeo del panel) |
| Function Invocations | **155.514 / 1.000.000** (Success 155.364 · User Error 150) |
| Fluid Provisioned Memory | 51,4 GB-Hrs |
| Function Duration | 0 GB-Hrs |
| Fast Data Transfer | 25,45 GB |
| Fast Origin Transfer | 998,36 MB |
| CDN Requests | 131K |
| CDN Request CPU Duration | 1m 23s |
| ISR Reads / Writes | 45K / 4 |
| Edge Function Execution Units · Edge Middleware Invocations · Microfrontends Routing · Global Config Reads | 0 |
| Private Data Transfer · PrivateLink Data Transfer | 0 B |

Fluid Active CPU por proyecto: **gymapp 3h 45m**, auslandaventures 1m 11s, vs-academico 37s, argentina-universo.sur 26s. Las invocaciones no se capturaron por proyecto.

**Edge Middleware Invocations = 0** con el proxy activo durante toda la ventana: esa métrica no mide el proxy de Next 16. La comparación de «invocaciones y CPU de Middleware» que proponía este documento no es posible con ella.

### Evolución diaria [estimado: lectura visual de las barras]

Valores aproximados, leídos de los gráficos (±15 s de CPU, ±300 invocaciones). Como control, la suma de las barras da ~3h 45m y ~154,8K, contra 3h 47m y 155.514 del panel. El gráfico de CPU es de los 4 proyectos; el de invocaciones, de la cuenta.

| Días | CPU por día (aprox.) | Invocaciones por día (aprox.) |
|---|---|---|
| 30/09–05/10 | 1–2,5 min | 0,9–2K |
| 06/10–09/10 | 4–7 min | 4–5K |
| 10/10 | ~10 min | ~11K |
| 11/10 | ~1 min | ~0,8K |
| 12/10–14/10 | 10–11,5 min | 8–10K |
| **15/10–17/10 (pico)** | **~19,5 / ~20,5 / ~21 min** | ~9,4K / **~19K** / ~15K |
| 18/10–21/10 | 5–11 min | 3,4–7K |
| 22/10–24/10 | <2 min | 0,6–1,6K |
| 25/10–28/10 | ~5 / ~9 / **~14** / ~13 min | ~2,9K / ~4,8K / ~8,5K / ~4,6K |
| 29/10 | ~7 min | ~3,4K |
| 30/10 (parcial, hasta 10 a.m.) | ~5 min | ~2,2K |

### Cortes y comparabilidad

| Corte | Momento (ART) | Qué cambia | Datos posteriores en esta captura |
|---|---|---|---|
| Diario `99fd0a1` instalado | 29/10 23:36:44 | Mobile #336–#340 en el iPhone | ≤ ~10,5 h (barra parcial del 30/10) |
| #343 en producción | 30/10 09:42 | Proxy | ≤ 18 min, o ninguno si la ventana está en UTC |
| #344 mergeado | 30/10 ~09:44 | Nada en el servidor; no instalado | — |
| #347 en producción | 30/10 ~09:58 | Nutrición del Resumen | ≤ 2 min, o ninguno |

**No se calcula ahorro.** La ventana es un acumulado de 30 días casi enteramente anterior a los cambios. La única porción posterior (30/10 hasta las 10 a.m.) es una barra diaria parcial, sin zona horaria visible, y está contaminada por el QA de este lote del 30/10: simulador contra producción, previews y verificaciones de logs, por ejemplo las aperturas de 09:43 y 09:59 ART. La variación entre días previos (de <1 min a ~21 min) es mayor que cualquier efecto esperable de estos cambios.

### Cómo medir con ventanas comparables

- Capturar con los mismos filtros (Team Usage) y además las pestañas **Projects** de Invocations y **Type / Runtime** de Fluid Active CPU.
- Usar días completos posteriores a todos los cortes: desde el 31/10, 7 días, contra los 7 días completos anteriores al 29/10. Comparar CPU por invocación, no solo totales, porque el uso diario varía mucho.
- Con #344 instalado, su efecto entra recién desde el día de la instalación: separarlo en otra ventana.
- Para valores diarios exactos se puede probar `vercel usage --breakdown daily` (CLI no instalada; no está confirmado que en Hobby muestre CPU).

### Medición diaria de 24 h (retención de logs)

Los logs de Supabase se conservan 24 h y cada consulta abarca como máximo 24 h. Consultar al terminar el día pierde su comienzo: a las 00:05 ART del 01/11 ya no están los primeros 5 minutos del 31/10. Los runtime logs de Vercel en Hobby duran 1 h.

Procedimiento para el día D (hora ART = UTC−3):

1. **Dos cortes, cada uno antes de que su primera hora cumpla 24 h:**
   - ~12:15 ART de D: de 00:00 a 12:00 ART (03:00–15:00Z);
   - ~00:15 ART de D+1: de 12:00 a 24:00 ART (15:00–03:00Z de D+1).

   En ambos, la ventana tiene inicio y fin explícitos (`iso_timestamp_start`/`_end`).
2. **Qué se guarda de cada corte:** solo agregados, en un archivo local fuera del repositorio:
   - `/auth/v1/user` por hora, por sesión (prefijo corto del `session_id`) y por origen (país / organización);
   - renovaciones de sesión (`/auth/v1/token`) por agente (`OWNLEVELDaily`, `OWNLEVELDev`);
   - las rutas REST más pedidas;
   - consultas idénticas repetidas en menos de 2 s;
   - respuestas que no son 2xx.

   No se guardan tokens, IDs de usuario ni valores de consulta.
3. **Vercel:**
   - `get_runtime_errors` de las últimas 24 h en el segundo corte;
   - runtime logs solo en el momento, dentro de la hora siguiente a una apertura de la app;
   - capturas de Usage el día D+1: Fluid Active CPU e Invocations con el valor de la barra de D, pestaña Projects y total del período.
4. **Sin QA contra producción durante D.** Anotar las aperturas reales de la app y cualquier instalación de Diario.

Relecturas del simulador (29–30/10): la build de desarrollo hizo las 7 lecturas de Inicio unos 2 s después de algunas renovaciones de sesión, aproximadamente cada 58 min. No ocurrió después de todas las renovaciones y el mecanismo no está confirmado: no se registra como un bucle. La app del simulador se cerró el 30/10 a las 14:01 ART.

## Supabase · `pg_stat_statements` (acumulado desde el 05/08/2026)

### Chequeo OAuth previo a cada solicitud (`ownlevel_restrict_oauth_data_api`)

| Momento (UTC) | Llamadas al chequeo | Consultas de datos de PostgREST |
|---|---|---|
| 29/10 23:01 | 983.394.283 | 307.442 |
| 30/10 12:32 | 983.401.086 | 314.245 |
| **Delta (13,5 h)** | **+6.803** | **+6.803** |

**[medido]** Hoy hay exactamente un chequeo por cada solicitud real (~0,14/s). Los ~983 M son históricos: no se pudo fechar el pico, porque `pg_stat_statements` no guarda marcas de tiempo y los logs del plan gratuito retienen 24 h. Sin acción.

### Consultas costosas recientes

Delta entre 29/10 ≈23:00 y 30/10 12:32 UTC (≈13,5 h):

| Consulta | Llamadas | Media | Tiempo |
|---|---|---|---|
| RPC `mobile_read_nutrition_report` | +467 | 117 ms | ~55 s |
| RPC `mobile_read_nutrition_day` | +148 | 94 ms | ~14 s |
| Resumen semanal de Inicio (sesiones + ejercicios + series embebidos) | +94 | 89 ms | ~8 s |
| `workout_sets.*` (historial de Progreso) | +376 | 17 ms | ~6,6 s |
| `workout_session_exercises.*` | +152 | 22 ms | ~3,4 s |

**[medido]** La actividad reciente de la base es baja en términos absolutos y la encabeza Nutrición, no Entrenamiento. El límite que preocupa es la CPU de Vercel, no Supabase.

Para medir en adelante, repetir la misma consulta y restar contra esta tabla.

## Nutrición · `mobile_read_nutrition_report`

**Qué la dispara [medido en código y logs]:** cada solicitud a `/nutrition/reports` hace 1 llamada:
- semana de Inicio;
- 7 días de Nutrición;
- precarga del mes del calendario, una vez por sesión de la app;
- tendencias de Progreso.

Además:
- el Resumen de Progreso: 2 llamadas antes de #347, 1 después;
- vistas y exploración: 1 por rango;
- Insight y Qué influye: ventanas unidas (92 días);
- Conexiones: ventana unida (actual + comparación);
- etapas: 1 por etapa.

Una apertura real de la app hacía 8 llamadas; desde #347, 7.

**Datos leídos y datos usados [medido]:** la RPC filtra todo por `log_date` dentro del rango, y cada día del reporte se arma solo con sus propios datos. Por eso un rango unido, cortado por fecha, da los mismos días. Comprobado con datos reales: días 60/60, comidas 448/448, entrenamientos 70/70.

**Tiempos: dos mediciones distintas, sin atribución.**
- **[medido]** Ejecución aislada dentro de la base, como el dueño con RLS, una corrida por rango: 7 días ~1,2 ms; 14 días ~2 ms; 29 días ~6 ms; 58 días ~8,5 ms.
- **[medido]** Media de `pg_stat_statements` para las llamadas que llegaron por PostgREST: 117 ms (desvío 197 ms, máximo 5,3 s). Es acumulada y mezcla rangos, usuarios, momentos y la sentencia que arma PostgREST.
- **[sin confirmar]** Las dos cifras no miden lo mismo, así que la diferencia no muestra dónde está el sobrecosto. Pueden influir los rangos largos, la caché fría, la sentencia de PostgREST o los planes genéricos de plpgsql. Ninguna de esas causas está demostrada. Tampoco se midió cuánto de ese tiempo llega a la CPU activa de Vercel.

**Descartado:**
- la precarga del calendario es UX deliberada (1 lectura por sesión);
- los rangos repetidos entre endpoints (el mismo mes lo leen el Resumen, la vista y la precarga) solo se evitan con una caché compartida o reestructurando endpoints. Quedan como propuesta.

## Propuestas pendientes, por prioridad

Orden: primero beneficio demostrado; después menor riesgo y menor esfuerzo. Ninguna tiene ahorro de CPU de Vercel medido.

| # | Propuesta | Beneficio demostrado | Riesgo | Esfuerzo | Estado |
|---|---|---|---|---|---|
| 1 | Instalar Diario con #344 y #350 | **Sí:** 14 → 7 lecturas por vuelta a primer plano con Entrenar visible (simulador, #344); Entrenar 5 → 3 lecturas por ronda y 0 si está oculta (mocks, #350) | Bajo (sin cambios de servidor) | Bajo | Bloqueado: renovar la firma requiere iniciar sesión en Xcode → Settings → Accounts y conectar el iPhone. El perfil vence el 31/10/2026 a las 23:56 UTC |
| 2 | Ventanas comparables en Usage | Habilita medir todo lo demás | Nulo | Bajo | Desde el 31/10, ver «Cómo medir» |
| 3 | Explicar la diferencia de tiempos de `mobile_read_nutrition_report` (ejecutar la sentencia como la arma PostgREST con `EXPLAIN (ANALYZE, BUFFERS)` por rango, como el dueño) | No: la diferencia de tiempos no está atribuida | Bajo (solo lecturas) | Bajo | Pendiente. No justifica cambios hasta tener la causa |
| 4 | Récords sin filas crudas (ver abajo) | No: [estimado] de ~2.700 filas a unos cientos por lectura | Medio–alto: migración y equivalencia exacta de `ComparableSet` por modo de carga | Alto | Pendiente; no se implementa todavía |
| 5 | Caché compartida de rangos de Nutrición entre endpoints | No medido | Medio: invalidación tras escrituras y aislamiento por usuario | Medio–alto | Pendiente; no se implementa todavía |
| 6 | Auth de la API móvil: `auth.getUser` → `getClaims` (JWKS) | No medido | Alto: cambia la semántica de revocación de sesiones | Medio | Requiere revisión de seguridad |

### Detalle de la propuesta 4 (requiere migración): récords sin filas crudas

**Problema [medido en código y volúmenes]:** `/progress/training`, el Resumen de Progreso, el detalle de ejercicio y los récords de Inicio leen el historial completo: ~2.700 filas, 4 solicitudes a PostgREST desde el PR #337. Lo hacen porque `recordSignal` necesita, por ejercicio, lo ocurrido antes del período:

- la mejor carga histórica;
- para cada carga, las repeticiones máximas.

El resto (resumen, serie temporal, músculos, rutinas, sensaciones) solo usa el período actual y el anterior.

**Lo que no se repite:** los filtros por rango con joins `!inner` anidados (PR #337, retirados). Devolvían lo mismo, pero leían ~40× más bloques sin bajar el tiempo de base.

**Propuesta (EXPAND → ADOPT → OBSERVE → CONTRACT):**

1. **Migración (EXPAND).** Dos RPC de solo lectura, `security invoker` (RLS del dueño), sin cambios de tablas:
   - `mobile_training_load_records(p_before date)` → filas `(exercise_id, weight_mode_snapshot, load_kg, max_reps)`. Agrupa las series completadas de sesiones completadas con `log_date < p_before`. Devuelve cientos de filas en lugar de miles, y su tamaño no crece con la antigüedad del historial sino con la variedad de cargas.
   - `mobile_read_training_window(p_from date, p_to date)` → sesiones completadas del rango con sus ejercicios y series completadas, en **una** consulta SQL con los joins resueltos en la base.
   
   Antes de crearlas, medir su plan con `EXPLAIN (ANALYZE, BUFFERS)` sobre la cuenta principal. Si hace falta un índice (por ejemplo `workout_sets (user_id, workout_session_exercise_id) where is_completed`), va en la misma migración.
2. **ADOPT.** `loadTrainingContext` arma `TrainingAnalysisSource` con la ventana (período actual + anterior) y `historyBeforePrimary` con los agregados.
   - **Requisito:** reproducir exactamente la construcción de `ComparableSet` por modo de carga (`trainingPerformanceStrategy`: kg, lingotes, peso corporal, tiempo).
   - **Pruebas:** igualdad de DTO antes/después (`trainingDto`, `trainingExerciseDto`, récords de Inicio) sobre fixtures con cambios de modo de carga, cargas repetidas y sesiones descartadas, más una comparación en local contra la base real como la del PR #337.
3. **OBSERVE.** Comparar `pg_stat_statements` (llamadas y bloques) y Vercel Usage con ventanas comparables, antes y después.
4. **CONTRACT.** Retirar la lectura completa de los consumidores migrados.

**Impacto esperado [estimado]:** filas por lectura de Progreso e Inicio de ~2.700 a unos cientos (período + agregados), constantes en el tiempo. No se declara ahorro de CPU hasta medirlo.

## Proceso

- Antes de mergear, verificar el check de **build** de Vercel sobre el **head exacto** del PR. Un comentario automático aprobado («Vercel Preview Comments») no lo reemplaza. En #347 el merge se hizo antes de que terminara ese check; el build de producción del mismo código terminó bien.
