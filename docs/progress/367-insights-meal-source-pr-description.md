## Resumen
El motor de Insights lee `meal_entries.consumed_at_source`. Paso de ADOPT de la [procedencia de la hora](367-meal-time-provenance.md).

**Base: `main`, que ya tiene el método parcial.** **Orden de rollout, SHAs y comprobaciones:** [paquete de autorización](https://github.com/IS03/Ownlevel/blob/integration/367-insights-candidate/docs/progress/367-autorizacion-migraciones.md). **No mergear ni desplegar antes de aplicar la migración del EXPAND de #387:** el loader selecciona la columna, y sin ella el endpoint responde 503.

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
| Importación, con su marca y su corrida | Nula | Cuenta |
| Importación editada sin tocar la hora | Nula | Cuenta |
| Importación con la hora cambiada, y vuelta a la original | Nula, sin marca | Sin valor: hora sin confirmar |
| Marca ya escrita en una fila común | Nula | Sin valor: hora sin confirmar |
| Marca insertada o agregada con un token, también con corrida propia | **Rechazado** | Sin valor |
| Mobile antiguo, con hora | Nula | Sin valor: hora sin confirmar |
| Mobile, otra hora sin declarar | Nula | Sin valor: hora sin confirmar |
| ChatGPT v2, con hora | Nula | Sin valor: hora sin confirmar |
| Mobile sin hora, ChatGPT sin hora, Web | `default_clock` | Sin valor: comida sin hora |
| ChatGPT v3, «ahora» | `registration_now` | Sin valor; solo sensibilidad |

Solo lo que cuenta llega a los pares de la relación, y cada exclusión dice por qué. El mismo contenido conserva su identidad, y una comida nueva la cambia.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
