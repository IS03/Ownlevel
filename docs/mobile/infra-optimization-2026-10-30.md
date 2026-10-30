# Optimización de infraestructura · 30/10/2026

Estado, mediciones y propuestas pendientes de este lote. Etiquetas: **[medido]** dato observado; **[estimado]** cálculo sin medición directa.

## Cambios integrados

| PR | Capa | Cambio | ¿Requiere actualizar Diario? |
|---|---|---|---|
| #343 | Servidor (proxy) | El proxy ya no se invoca en `ownlevel.fit` / `www.ownlevel.fit` fuera de las páginas de sesión. Previews y `*.vercel.app` conservan la protección de previews en todas las rutas | No |
| #344 | Mobile | Inicio refresca al volver a primer plano solo si está visible | **Sí** (instalado: `99fd0a1`, 29/10 23:36:44 ART) |

Mediciones:

- **[medido, simulador contra producción]** #344: una vuelta a primer plano con Entrenar en pantalla pasa de 14 lecturas a 7. Desaparecen las 7 de Inicio oculta, incluido `/progress/training` (historial completo).
- **[medido, `next dev` con `Host` variable]** #343: en el dominio de producción, `/api/mobile/*` y los archivos estáticos ya no pasan por el proxy; `/login` y las páginas de sesión sí. En producción, después del deploy:
  - `/home` y `/train` sin sesión → 307 a `/login`;
  - API sin token → 401;
  - `/sw.js` y el manifest → 200;
  - lecturas reales de la app → 15/15 con 200.
- **[medido]** Filtro de builds (#339): el merge solo móvil de #344 quedó «Canceled by Ignored Build Step» en producción.
- **Sin medir:** el ahorro de CPU del proxy. El plan Hobby no desglosa la CPU de Middleware/Proxy por ruta. Comparar Vercel → Usage (invocaciones y CPU de Middleware), 7 días antes y después del 30/10.

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

**[medido]** La actividad reciente de la base es baja en términos absolutos y la encabeza Nutrición, no Entrenamiento. Supabase no es el cuello de botella; el límite es la CPU de Vercel (Fluid Active CPU, 4 h por mes en Hobby).

Para medir en adelante, repetir la misma consulta y restar contra esta tabla.

## Propuesta pendiente (requiere migración): récords sin filas crudas

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
3. **OBSERVE.** Comparar `pg_stat_statements` (llamadas y bloques) y Vercel Usage antes y después.
4. **CONTRACT.** Retirar la lectura completa de los consumidores migrados.

**Impacto esperado [estimado]:** filas por lectura de Progreso e Inicio de ~2.700 a unos cientos (período + agregados), constantes en el tiempo. No se declara ahorro de CPU hasta medirlo.

## Otros pendientes
- Instalar Diario con #344. Además, renovar la firma de Diario (perfil vence 31/10/2026 23:56 UTC): Xcode no tiene ninguna cuenta configurada. Requiere iniciar sesión en Xcode → Settings → Accounts y conectar el iPhone.
- RPC de Nutrición (`mobile_read_nutrition_report` / `_day`): son las consultas más costosas recientes. Conviene investigarlas con `EXPLAIN` en un trabajo propio.
- Auth de la API móvil: `auth.getUser` en cada solicitud. Un cambio a `getClaims` (JWKS) es de autenticación y requiere revisión de seguridad.
