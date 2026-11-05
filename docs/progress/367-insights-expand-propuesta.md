# Insights #367 — Propuesta de EXPAND y metodología parcial

**Propuesta para revisión. Nada de esto está implementado, migrado ni aprobado.** Sale de la revisión de [#385](https://github.com/IS03/Ownlevel/pull/385) y sigue el rollout EXPAND → ADOPT → OBSERVE → CONTRACT. Cada bloque va en su propio PR.

El motor ya conserva lo desconocido como desconocido: ver [motor y calibración](367-insights-pr4-motor.md). Por eso, **con los datos actuales no produce comparaciones**: todo queda en `insufficient_comparison / missing_context`. Hay que decidir entre el bloque B y el bloque C antes de que Hechos y Asociaciones tengan contenido.

## A. Procedencia de la hora de comida

**Problema.** Ningún productor actual, salvo la importación histórica, distingue una hora declarada de una completada por el reloj:

| Productor | `consumed_at` | `raw_input` |
| --- | --- | --- |
| Web, `createMealEntry` | La indicada, o el reloj de la app | `null` en ambos casos |
| Mobile, comida manual y registro rápido | `coalesce(consumedAt, now())` | `null` en ambos casos |
| Mobile, edición | La indicada, o se conserva | Sin cambios si la comida es manual |
| ChatGPT v1 | `now()` | `null` |
| ChatGPT v2 con hora | La indicada | `null` |
| ChatGPT v2 sin hora | `now()` | `{"originalTimeKnown":false}` |
| ChatGPT v3, «comí ahora» | `now()` | `{"originalTimeKnown":false,"timeSource":"registration"}` |
| Importación histórica | La de la planilla, o las 12:00 | `originalTimeKnown` `true` o `false` |

**Propuesta.**

```sql
alter table public.meal_entries
  add column consumed_at_source text
  check (consumed_at_source in ('declared', 'registration', 'default_clock', 'imported'));
```

- Nula en todas las filas existentes: significa «no se sabe». **Sin backfill**: nada permite reconstruirlo.
- Se escribe del lado del servidor, en las RPC y en `createMealEntry`, sin cambiar contratos de clientes instalados:
  - `declared`: llegó una hora en la creación, o una hora distinta en la edición.
  - `default_clock`: no llegó hora.
  - `registration`: ChatGPT v3.
  - Editar sin cambiar la hora, o mover de día conservando la hora, no cambia la procedencia.
- ADOPT: `mealTimeEvidence` admite `declared` como `explicit`. `raw_input` sigue valiendo para la importación.
- **Alcance real:** la ventana de 3 h solo empezaría a tener pares con comidas nuevas. Hacen falta al menos 20 pares.

Es independiente de B y C. No requiere decisión de producto más allá de aprobarlo.

## B. Captura de configuración

**Problema.** `workout_session_exercises` guarda nombre, implemento y modo, pero ninguna configuración. El método publicado exige que sea histórica y explícita, y admite `none` «solo si su ausencia se conoce históricamente». El catálogo vigente no es historia.

**Propuesta.**

```sql
alter table public.workout_session_exercises
  add column configuration_snapshot text;
```

- Nula en todas las filas existentes. **Sin backfill.**
- Necesita una regla de producto que hoy no existe y que no puedo inferir: **¿una variante de agarre, banco o posición es siempre otro ejercicio?**
  - **Si la regla se adopta y se comunica en la app**, el servidor escribe `none` en cada ejercicio nuevo de sesión. Es verificable desde esa fecha, sin agregar pasos al entrenamiento.
  - **Si no**, hace falta un selector de configuración en la sesión, que suma fricción y requiere diseño.
- **Alcance real:** cada ejercicio empieza a compararse desde su segunda sesión posterior al EXPAND. El historial anterior sigue sin comparación.

## C. Metodología de contexto parcial

**Solo para revisión. No es un ajuste de `insights-performance/1`.** Si se aprueba, sería un método distinto, con versión propia, por ejemplo `insights-performance-partial/1`. Permitiría usar el historial existente, que B no recupera.

| Regla | Propuesta |
| --- | --- |
| Compara | Mismo UUID, modo, unidad e implemento históricos, con configuración desconocida en ambos lados |
| Nunca compara | Configuración conocida contra desconocida, ni modo o implemento faltantes |
| Salida | `contextCompleteness: "configuration_unknown"` en cada resultado; versión de método propia |
| Lectura | «Registro inferior con contexto parcial». No se presenta como un hecho equivalente a `/1` |
| Récords | Separados de los récords de `/1` y rotulados con el mismo límite |
| Asociaciones | Fuera de la compuerta estricta. Si se usan, con su propia familia y calibración |
| Riesgo | Un cambio de agarre no registrado se lee como mejora o descenso. No se puede medir: el dato no existe |

**Validación necesaria:** fixtures propias, sin reutilizar los resultados de `/1`, y una calibración que simule cambios de configuración no registrados. La tasa de esos cambios es un supuesto, no un dato.

B y C no se excluyen: C cubre el pasado con su límite declarado y B da comparaciones completas hacia adelante.

## D. Consistencia con menos consultas

**Situación.** Cada intento hace 14 consultas de revisión más las páginas. El total y los reintentos están medidos en el [motor](367-insights-pr4-motor.md#costo-real-de-lectura).

**Propuesta.** Una sola RPC con todas las revisiones:

```sql
create function public.insights_source_revision()
returns jsonb language sql stable security invoker set search_path = '' as $$ ... $$;
```

- `security invoker`, para seguir bajo RLS. Identidad tomada de `auth.uid()`, sin `service_role`.
- Las siete cuentas salen de un mismo snapshot. La garantía es la misma o mejor, y no hay que quitar nada.
- Costo por intento: `páginas + 2` en lugar de `páginas + 14`.

**Recomendación: decidirlo con datos de OBSERVE.** A 5 años ahorra 12 de 96 consultas, y con estadísticas la revisión pesa poco: unos 85 ms de 330 ms en la pila local. Pero sin estadísticas la revisión de `workout_sets` subió a 1,2 s por ronda. Si eso aparece en producción, esta RPC deja de ser una optimización menor: permite controlar esa consulta en un solo lugar. La medición es de una pila local, y por eso no alcanza para decidir hoy.

No se proponen paginación parcial, truncamiento ni lecturas sin comprobación de revisión: cualquiera de ellas quitaría una garantía del motor.
