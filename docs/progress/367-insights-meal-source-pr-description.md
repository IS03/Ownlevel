## Resumen
El motor de Insights lee `meal_entries.consumed_at_source`. Paso de ADOPT de la [procedencia de la hora](367-meal-time-provenance.md).

**Depende del método parcial** (base: `codex/367-insights-partial-method`). **No mergear ni desplegar antes de aplicar la migración del EXPAND:** el loader selecciona la columna, y sin ella el endpoint responde 503.

## Cambios
- `user_declared` e `imported` cuentan como hora conocida. `registration_now` es aproximada y solo entra en sensibilidades. `default_clock` queda fuera de la ventana, y un cero nunca reemplaza al dato.
- Con la columna nula rige la regla actual: `explicit` solo con la marca de importación, y `unverified` en cualquier otro caso. Sin backfill.

## Validación
Regresiones de evidencia y de la ventana de 3 h, `tsc`, `eslint`. **Sin prueba contra PostgREST** de esta combinación: la columna se probó en el PR del EXPAND y el loader, con un cliente simulado.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
