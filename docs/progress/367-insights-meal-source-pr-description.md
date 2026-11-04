## Resumen
El motor de Insights lee `meal_entries.consumed_at_source`. Paso de ADOPT de la [procedencia de la hora](367-meal-time-provenance.md).

**Depende del método parcial** (base: `codex/367-insights-partial-method`). **No mergear ni desplegar antes de aplicar la migración del EXPAND:** el loader selecciona la columna, y sin ella el endpoint responde 503.

## Cambios
- `user_declared` e `imported` cuentan como hora conocida. `registration_now` es aproximada y solo entra en sensibilidades. `default_clock` queda fuera de la ventana, y un cero nunca reemplaza al dato.
- Con la columna nula rige la regla actual: `explicit` solo con la marca de importación, y `unverified` en cualquier otro caso. Sin backfill.

## Validación
Regresiones de evidencia y de la ventana de 3 h, `tsc`, `eslint`.

**Recorrido real** contra PostgREST en una pila local descartable con el esquema expandido y datos sintéticos, escribiendo cada comida por su camino real, leyendo con el loader y evaluando la ventana:

| Productor | Se guarda | Ventana de 3 h |
| --- | --- | --- |
| Mobile manual y rápido, declarada | `user_declared` | Cuenta |
| Mobile, declaración con igual hora en una edición | `user_declared` | Cuenta |
| ChatGPT v4 | `user_declared` | Cuenta |
| Importación antigua, solo con su marca | Nula | Cuenta |
| Mobile antiguo, con hora | Nula | Sin valor: hora sin confirmar |
| Mobile, otra hora sin declarar | Nula | Sin valor: hora sin confirmar |
| ChatGPT v2, con hora | Nula | Sin valor: hora sin confirmar |
| Mobile sin hora, ChatGPT sin hora, Web | `default_clock` | Sin valor: comida sin hora |
| ChatGPT v3, «ahora» | `registration_now` | Sin valor; solo sensibilidad |

Solo lo que cuenta llega a los pares de la relación, y cada exclusión dice por qué. La misma revisión responde con 7 consultas, y una comida nueva la cambia. No apareció ningún defecto en este recorrido.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
