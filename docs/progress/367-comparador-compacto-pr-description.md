# #367 — Salida compacta del comparador para Insights

**Baja el pico de memoria de Insights a 10 años, de 214 a 170 MiB, sin cambiar ningún resultado.** No alcanza el presupuesto de 128 MiB: ver «Límites».

## Qué cambió

- **Opción nueva:** `output: "compact"` en el comparador (`buildPerformanceInsightsV1`, `buildPerformanceInsightsPartialV1` y `compareSessions`). Solo Insights la pide. **El valor por defecto sigue siendo la salida completa**, sin cambios para los demás consumidores.
- **Un solo algoritmo:** el recorrido, la elección de referencias, los récords y las exclusiones son los mismos.
  - La clasificación (estado, motivo y la evidencia en que se apoya) sale de una función compartida, `classify`.
  - La evidencia se sigue calculando porque de ella sale el estado. La salida compacta solo no la conserva.
- **La salida compacta no entrega:**
  - la exposición actual ni la de la referencia, con sus copias de series;
  - la evidencia;
  - los volúmenes.
- **Sí entrega:**
  - estado y motivo;
  - la referencia: sesión, fin y antigüedad;
  - los hechos de récord;
  - las exclusiones.
- **Se conservan** los denominadores, el orden y los dos métodos, estricto y parcial.
- **Tipos:** `CompactExercisePerformance`, `SessionPerformanceOf<E>`, `DailyPerformanceOf<E>` y sus versiones parciales. Los tipos existentes no cambian.
- **Contratos instalados:** sin cambios.
- **Fixture:** el generador de historiales desordenados de `summary-equivalence.test.ts` pasó a `messy-history.fixture.ts` para compartirlo.

## Equivalencia

- **Proyección exacta** (`compact-output.test.ts`): la compacta es igual a la proyección de la completa.
  - 30 historiales desordenados, por cada combinación de:
    - regla de contexto: configuración requerida o desconocida;
    - detalle de exclusiones: `summary` o `full`;
    - con índice o sin él;
    - historial disponible o no.
  - Más el método parcial con su partición.
  - **Cobertura comprobada:** los historiales alcanzan los cinco estados, señales cruzadas, evidencia sin ancla, empates de referencia, falta de contexto, referencias con problema, récords nuevos, contexto distinto y los cuatro modos de carga.
- **Salida completa sin cambios:** su hash coincide entre main y la rama en **401 de 401** combinaciones. Cubre 40 historiales × reglas × detalle × índice, el método parcial, el historial no disponible y un historial sintético con configuración.
- **Vistas de Insights:** la huella de #407 da **53 de 53** hashes iguales. Abarca todas las vistas, páginas y detalles de relaciones, en los dos métodos.
- **Pruebas:**
  - comparador, motor y contrato de Insights: 371 pasan;
  - Insights en Mobile: 49 pasan.
- **Tipos y lint:** sin errores ni advertencias.

## Memoria y tiempo, antes y después

Mismo equipo, datos y procedimiento (`scale.test.ts`, cinco corridas por perfil en su propio proceso). Main `2eb08b1` contra la rama.

| 10 años | Antes | Después |
| --- | --- | --- |
| **Pico residente, método 2** | **213,7 MiB** | **169,8 MiB** |
| Pico residente, método 1 | 213,4 MiB | 166,0 MiB |
| Pico residente, configuración capturada | 179,3 MiB | 139,7 MiB |
| Piso de heap, método 2 (el menor `--max-old-space-size` que termina) | 180 MiB (5 de 5; 175 MiB, 4 de 5) | **135 MiB** (4 de 4; 130 MiB, 2 de 4) |
| Retenida por instantánea | 13,1 MiB | 13,1 MiB |
| Instantánea, mediana | 1093 ms | 1090 ms |
| Relaciones, mediana | 1093 ms | 1058 ms |

- **Perfiles más chicos:** 5 años, de 81,8 a 71,2 MiB de pico; 1 año, de 40,5 a 39,4 MiB.
- **Tiempo:** dentro del ruido.
- **Retenida:** sin cambio, porque #407 ya descartaba la evidencia al terminar cada comparador. Esta mejora es durante el cálculo.

## Consultas y tamaño de respuesta

Sin cambio: 268 consultas a 10 años. Las respuestas son idénticas byte a byte (123,9 / 89,8 / 29,4 / 258,1 KiB).

## Límites

- **Pico a 10 años:** 170 MiB, por encima del presupuesto de 128. Lo que queda es lo que el algoritmo sí usa:
  - las exposiciones preparadas de todas las sesiones, con sus series;
  - los índices por ejercicio y contexto;
  - el contexto de exposición.
- **Para bajar más** hay que recorrer la historia por partes, por ejemplo ejercicio por ejercicio. Es un cambio de arquitectura del comparador y queda pendiente.
- **Sin cambios:** la lectura en frío (268 consultas) y el detalle de una relación (258 KiB).
- **Producción:** no se midió en la función real de Vercel.

Metodología y detalle: [367-insights-partial-metodo.md](367-insights-partial-metodo.md), sección «Salida compacta del comparador, 2026-11». Previews bloqueadas para `codex/367-comparator-compact` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
