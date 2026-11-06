# #367 — Lectura en frío de Insights: series dentro de sus ejercicios

**Abrir Insights sin caché pide 39 % menos consultas, con resultados idénticos.** La latencia casi no cambia: ver «Límites».

## Qué cambió

- **Series embebidas.** El cargador (`readInsightsSource`) ya no tiene un flujo propio de series. Viajan dentro de la página de su ejercicio:
  - con `sets:workout_sets(id,actual_reps,actual_weight_kg,is_completed,completed_at)`;
  - filtradas por dueño (`sets.user_id`);
  - y ordenadas por id dentro de cada ejercicio.
- **La misma fuente que antes.** Al recibirlas, el cargador las aplana, descarta las de ejercicios de sesiones no completadas, como antes, y las ordena por id. El motor recibe la misma fuente, en el mismo orden.
- **Lo que no cambia:**
  - el tamaño de página;
  - la identidad, RLS y el contador transaccional;
  - el reintento y la distinción entre error y vacío;
  - los métodos y los contratos instalados;
  - el historial: nada se trunca.
- **Pruebas actualizadas:** cuentan seis flujos en lugar de siete.

## Límite efectivo del servidor, comprobado

Pila local descartable (PostgreSQL 17.11 y 17.6, PostgREST 16.5, `max_rows = 1000`):
- pedir 5000 filas de primer nivel devuelve 1000;
- una página de 1000 ejercicios trae sus 4000 series embebidas, completas.

El tope limita las filas de primer nivel, no las embebidas.

## Equivalencia

- **Mismos datos sembrados.** Main y la rama leyeron los mismos dos usuarios (5 y 10 años, con 4 series por ejercicio). La fuente que recibe el motor y todas las vistas de los dos métodos dan el mismo hash antes y después: **7 de 7** en cada perfil. Abarcan todas las páginas, relaciones y detalles con su evidencia.
- **Prueba local nueva:**
  - **Escenario:** 1180 series en una página de ejercicios, por encima del tope, más series de otra persona y de una sesión no completada.
  - **Resultado:** la fuente trae exactamente las del dueño en sesiones completadas, en el orden de la base, con 2 + 6 pedidos.
- **Pruebas que pasan:**
  - **Locales:** Insights (7), cruce de token (29) en 17.11; sueño y peso (4) y configuración (5) en 17.6.
  - **Unitarias del endpoint:** 23.
  - **API móvil:** 718. La única falla, `training-session.test.ts`, es la preexistente de main.
- **No se corrió:** `insights-source-revision.local` no usa el cargador y necesita un esquema anterior a su propia migración.
- **Tipos y lint:** sin errores ni advertencias.

## Medición, antes y después

Lectura completa en frío contra PostgREST local. Siete lecturas, mediana.

| | 5 años, antes | 5 años, después | 10 años, antes | 10 años, después |
| --- | --- | --- | --- | --- |
| Consultas | 84 | **52** | 159 | **97** |
| Bytes recibidos | 17,2 MiB | 15,4 MiB | 34,2 MiB | 30,7 MiB |
| Tiempo | 1254 ms | 1200 ms | 3157 ms | 3030 ms |

**Perfil sintético del benchmark** (5 series por ejercicio y 30 métricas): la lectura completa pasa de 18, 84 y 268 a **12, 52 y 142 consultas** a 1, 5 y 10 años.

**Memoria:** el motor recibe la misma fuente, así que la memoria del cálculo no cambia.

## Límites

- **Latencia:** baja apenas un 4 %. La fija ahora el flujo de valores diarios, con 59 páginas secuenciales a 10 años. Por el offset, cada página cuesta más cuanto más adentro está: 4 ms en la primera y 32 ms con offset 57.000 (`EXPLAIN ANALYZE`).
- **Propuesta, no implementada:** paginar por clave (`id > último`). Bajaría el tiempo por página, no la cantidad de consultas.
- **Producción:** no se midió. La pila local no reproduce la red ni el pooler.
- **Sin migración ni RPC.**

Metodología: [367-insights-partial-metodo.md](367-insights-partial-metodo.md), sección «Lectura en frío, 2026-11». Previews bloqueadas para `codex/367-insights-cold-read` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
