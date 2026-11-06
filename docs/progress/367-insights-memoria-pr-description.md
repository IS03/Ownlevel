# #367 — Memoria del motor de Insights

Reduce la memoria viva que necesita el motor y la que retiene cada entrada reutilizable, **sin cambiar ningún resultado**. Solo `read-model.ts` y los tipos de `exposures.ts`. Sin cambios en métodos, comparadores, candidatos, contratos, caché transaccional, RLS ni historial analizado.

## Qué cambió

**Diagnóstico** (10 años, sobre main `f53fae0`):
- **Retención innecesaria:** la salida completa de cada comparador quedaba viva hasta el final de la construcción, junto con la otra y con las sesiones adaptadas:
  - estricto: 26 MiB;
  - parcial: 68 MiB;
  - sesiones adaptadas: 12,6 MiB.
- **Lo que de verdad se usa:** de cada ejercicio, el modelo solo publica estado o lectura, motivo, referencia y si hay récord.
- **Carriles:** cada uno retenía la tabla de exposición entera.

**Cambios**
- **Un comparador a la vez:** `factsOfStrict` y `factsOfPartial` calculan cada comparador y devuelven solo los hechos publicados. Cada sesión se reduce una vez. La salida completa queda como basura antes de que empiece el siguiente comparador.
- **Sesiones adaptadas:** viven en un bloque que termina antes de construir el contexto y las tablas.
- **Carriles:** guardan `rows`, `candidates` y `sessionIdsByDate`. El resto de la tabla ya está copiado en los días publicados.
- **Tipos:** `strictOutcomeDays` y `partialOutcomeDays` aceptan cualquier día con los cuatro campos que usan, por ejemplo la copia reducida.

## Equivalencia comprobada

- **Huella** (`equivalence-fingerprint.test.ts`, herramienta activada por variable de entorno):
  - **Qué hashea:** todas las vistas, todas las páginas de días y la evidencia completa de cada relación de los dos métodos, más el modelo completo y sus detalles.
  - **Datos:** cinco historiales sintéticos de 1 y 5 años, con y sin configuración.
  - **Resultado:** **53 de 53 hashes iguales** antes y después. Dos corridas del código anterior dieron los mismos hashes.
- **Prueba dirigida** (`memory.test.ts`): reconstruye los hechos desde la salida completa de cada comparador, como lo hacía el código anterior, y los compara con la instantánea con y sin configuración. También comprueba que cada carril guarda solo lo necesario.
- **Pruebas existentes:**
  - motor, comparador y contrato de Insights: 296 pasan; las omitidas son las locales y las de campaña;
  - Insights en Mobile: 49 pasan.
- **Tipos y lint:** sin errores ni advertencias.

## Memoria y tiempo, antes y después

Mismo equipo, mismos datos y mismo procedimiento: `scale.test.ts`, cinco corridas por perfil, cada una en su propio proceso.

| Perfil | Retenida | Pico residente |
| --- | --- | --- |
| 1 año, método 2 | 2,0 → 1,9 MiB | 40,4 → 41,6 MiB |
| 5 años, método 2 | 7,4 → 6,5 MiB | 83,5 → 80,6 MiB |
| 10 años, método 2 | **15,5 → 13,1 MiB** | 213,4 → 213,9 MiB |
| 10 años, método 1 | 14,5 → 13,4 MiB | 212,4 → 213,6 MiB |
| 10 años, configuración capturada | 13,7 → 11,2 MiB | 177,4 → 178,9 MiB |

**Piso de heap.** Es el `--max-old-space-size` más chico con el que una instantánea de 10 años y las relaciones de los dos métodos terminan. Es la memoria viva que hace falta, e incluye la fuente de 67,5 MiB.
- **Antes:** 220 MiB, 4 de 4. Con 215 MiB terminó 1 de 4; con 210, 0 de 4.
- **Después:** 175 MiB, 5 de 5. Con 170, 0 de 5.
- **Unos 45 MiB menos.**

**Tiempo** (10 años, método 2, mediana / máximo):
- instantánea: 1095 / 1139 → 1126 / 1226 ms;
- relaciones: 1061 / 1149 → 1085 / 1171 ms.

Está dentro de la variación entre corridas: no hay mejora ni costo medible.

## Consultas y tamaño de respuesta

- **Consultas, sin cambios:** 18, 84 y 268 a 1, 5 y 10 años (`P + 2`). El benchmark ahora informa esa fórmula, que es la del cargador actual. Antes informaba `P + 14`, una cifra vieja.
- **Respuestas, idénticas byte a byte** (lo garantiza la huella). A 10 años: `summary` 123,9 KiB, `days` 89,8, `relations` 29,4 y `relation` 258,1.
- **Benchmark:** acepta `INSIGHTS_SCALE_METHOD=2` para medir el método que pide Mobile.

## Límites pendientes

- **Pico residente a 10 años:** sigue en unos 213 MiB. Lo fija el trabajo interno de cada comparador, que V8 no devuelve entre fases: medido solo, el parcial lleva el residente a 109 MiB sobre la base, contando las sesiones adaptadas.
- **Para bajarlo hace falta un cambio mayor:** un modo del comparador que no materialice evidencia, volúmenes ni copias de series cuando solo se necesita estado, motivo, referencia y récord. Toca `performance-insights` y necesita su propia equivalencia, así que no entra aquí.
- **Lectura en frío y detalle de una relación:** sin cambios, 268 consultas y 258 KiB a 10 años.
- **Producción:** la memoria no se midió en la función real de Vercel.

Detalle y metodología: [367-insights-partial-metodo.md](367-insights-partial-metodo.md), sección «Memoria del motor, 2026-11». Previews bloqueadas para `codex/367-insights-memory` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
