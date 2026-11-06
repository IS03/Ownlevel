# #367 — Lectura en frío de Insights: series dentro de sus ejercicios

**Abrir Insights sin caché pide 40 % menos consultas y recibe 11 % menos bytes, con resultados idénticos.** La latencia no mejora de forma confiable: ver «Límites».

## Qué cambió

- **Series embebidas.** El cargador (`readInsightsSource`) ya no tiene un flujo propio de series. Viajan dentro de la página de su ejercicio:
  - `sets:workout_sets(id,actual_reps,actual_weight_kg,is_completed,completed_at)`;
  - filtradas por dueño (`sets.user_id`) y ordenadas por id.
- **La misma fuente.** Se aplanan, se descartan las de sesiones no completadas y se ordenan por id: el motor recibe la misma fuente que antes.
- **Control de listas cortadas** (revisión de #409). En paralelo se cuenta una vez cuántas series tiene la persona (`count=exact`, sin filas).
  - Si las listas embebidas suman menos, se leen las series como su propio flujo paginado, como antes.
  - Nunca se publica una lista parcial, y nunca se hace un pedido por ejercicio.
  - Si el conteo falla, la lectura no está disponible.
- **Lo que no cambia:** el tamaño de página, la identidad, RLS, el contador transaccional, el reintento, la distinción entre error y vacío, los métodos y los contratos instalados.

## El tope de PostgREST, comprobado

Pila local descartable: PostgreSQL 17.6 y 17.11, PostgREST 16.5, `max_rows = 1000`.

- **Primer nivel:** pedir 5000 filas devuelve 1000.
- **Listas embebidas:** **también se cortan, una por una.** Un padre con 1500 hijos recibe 1000. La primera versión de este PR decía lo contrario; está corregido.
- **Agregados:** un `count` embebido no se corta.
- **Por qué hoy no se corta ninguna lista de series:** el esquema limita un ejercicio de sesión a 50 series (`workout_sets_set_number_check` 1–50 con `workout_sets_unique_number`). En la pila, la serie 51, una segunda 50 y renumerar a 1000 son rechazadas.
- **El control de arriba:** cubre el caso de que cambie el esquema o el tope.

## Equivalencia

- **Contra SQL:** todos los ids de series de main, de la rama sin control y de la rama final coinciden con SQL, en el mismo orden: 32.684 a 5 años y 64.434 a 10 años. Esos datos incluyen ejercicios con 50 series y una sesión en curso.
- **Contra main:** la fuente completa y todas las vistas de los dos métodos dan el mismo hash, 8 de 8 en cada perfil.
- **Pruebas locales nuevas:**
  - 50 series en un ejercicio y la 51 rechazada;
  - 1180 series en una página, con series de otra persona y de una sesión no completada.
- **Pruebas unitarias nuevas:**
  - listas cortadas al tope que se recuperan con un único flujo paginado, sin pedidos por ejercicio;
  - un conteo fallido que da no disponible.
- **Suites que pasan:**
  - locales: Insights (8), sueño y peso (4), configuración (5) y cruce de token (29);
  - unitarias del endpoint: 25.
- **Tipos y lint:** sin errores ni advertencias.

## Medición, antes y después

Lectura completa en frío contra PostgREST local (PostgreSQL 17.6), siete lecturas, mediana.

| | Consultas | Bytes | Tiempo |
| --- | --- | --- | --- |
| 5 años, main | 85 | 17,5 MiB | 911 ms |
| 5 años, rama | **53** | 15,7 MiB | 960 ms |
| 10 años, main | 162 | 34,8 MiB | 2361 ms |
| 10 años, rama | **98** | 31,1 MiB | 2425 ms |

- **Otra pila (17.11, antes del control):** 159 → 97 consultas y 3157 → 3030 ms.
- **Control descartado:** un conteo embebido por ejercicio sumaba unos 120 ms a 10 años. El conteo único no agrega tiempo medible.
- **Perfil sintético:** de 18, 84 y 268 a **13, 53 y 143 consultas** a 1, 5 y 10 años.
- **Memoria del cálculo:** sin cambio, porque es la misma fuente.

## Límites

- **Latencia:** sin mejora confiable (±3–4 % según la pila). La fija el flujo de valores diarios: 59 páginas por offset a 10 años, de 4 ms la primera a 32 ms la última.
- **Propuesta:** paginar por clave. Bajaría el tiempo por página, no la cantidad de consultas.
- **Producción:** no se midió. Sin migración ni RPC.

Metodología: [367-insights-partial-metodo.md](367-insights-partial-metodo.md), sección «Lectura en frío, 2026-11». Previews bloqueadas para `codex/367-insights-cold-read`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
