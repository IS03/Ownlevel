## Resumen
ADOPT de la [revisión de las fuentes](367-insights-source-revision.md): el motor lee el contador transaccional y vuelve a reutilizar resultados, ahora con un criterio fiable.

**Base: #386.** **No mergear ni desplegar antes de aplicar la migración del EXPAND de la revisión:** sin la tabla, el endpoint responde 503.

## Cambios
- El control durante una lectura usa el contador, antes y después. Un cambio confirmado se detecta y se lee de nuevo.
- La reutilización vuelve: clave de cuenta (del token), contador y día de Córdoba, 3 entradas y 5 minutos.
- Quita las 14 consultas de revisión, incluida la de `workout_sets` con plan frágil.

## Costo
| | #386 | Este PR |
| --- | --- | --- |
| Lectura completa | `P + 14` | `P + 2` |
| Otra vista, si sigue en memoria | `P + 14` | **1** |
| PostgREST local a 5 años, lectura completa | 562–720 ms; 3,1–3,2 s sin estadísticas | 426–634 ms; 618–734 ms sin estadísticas |

**La reutilización es una optimización, no una garantía.** En otra instancia de Vercel se paga la lectura completa, y la tasa de aciertos real no se conoce. Siguen sin resolver a 10 años: el detalle de una relación (258 KiB), el pico de memoria (210 MiB) y la lectura en frío (268 consultas).

## Validación
Con el esquema expandido en PostgREST local y dos transacciones reales:
- Un resultado en caché caliente se invalida cuando confirma una transacción más vieja, y la pantalla muestra el valor nuevo.
- Ese mismo cambio, durante una lectura, se detecta: dos intentos, y publica el valor confirmado.

Pruebas del endpoint: costo con reintentos, medianoche, cuentas separadas, contador sin fila, tabla ausente y token inválido.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
