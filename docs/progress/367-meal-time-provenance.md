# Procedencia de la hora de comida — EXPAND → ADOPT

Parte de [#367](https://github.com/IS03/Ownlevel/issues/367). Registra quién fijó `meal_entries.consumed_at` en el momento de escribirla, porque después no se puede reconstruir. **Sin aplicar en producción.** Migración: `supabase/migrations/20261104180000_meal_time_provenance_expand.sql`.

## Por qué hace falta un campo

Que llegue una hora no prueba que alguien la haya elegido:

| Productor | Qué manda hoy | Por qué no alcanza |
| --- | --- | --- |
| Mobile, edición | `consumedAt` de la comida, precargado en el borrador | Lo reenvía aunque nadie haya tocado la hora |
| Mobile, mover de día | `consumedAt` recalculado con el mismo reloj | Lo arma el cliente |
| Mobile, cambiar el momento | `consumedAt` del borrador | Mismo envío, otra intención |
| Mobile, hoja de hora | `consumedAt` elegido | Es la única declaración real, y hoy es indistinguible de las anteriores |
| Web, `createMealEntry` | El reloj de la app, salvo que el llamador pase una hora | Ningún llamador la pasa |
| ChatGPT v1 y v2 sin hora | Nada; la base usa `now()` | Es reloj |
| ChatGPT v2 con hora | `time` | La instrucción dice «solo si el usuario la dijo», pero el modelo puede deducirla |
| ChatGPT v3, `consumed_now` | Nada; la base usa `now()` | Registro «ahora», aproximado |
| Importación histórica | Hora de la planilla o las 12:00 | `raw_input.originalTimeKnown` lo distingue. Ya se ejecutó, y el script rechaza volver a importar |

## Valores

`consumed_at_source`, nullable y sin valor por defecto.

| Valor | Significa | Quién lo escribe |
| --- | --- | --- |
| `user_declared` | El cliente declara que la persona eligió esta hora | Mobile con `consumedAtSource`; ChatGPT con `time_stated_by_user` |
| `registration_now` | La persona dijo que come ahora; el reloj de la base es la hora aproximada | ChatGPT v3 |
| `default_clock` | No llegó ninguna hora y un reloj la completó | RPC de Mobile y ChatGPT; Web en ADOPT |
| `imported` | Una importación con la hora original | Reservado. No hay importación prevista: las filas ya importadas quedan nulas y conservan su marca en `raw_input` |
| `null` | Nadie puede saberlo | Todas las filas anteriores y las horas enviadas sin declaración |

**Sin backfill.** Ningún dato existente permite reconstruirlo.

## Reglas de escritura

**Crear (Mobile):**
- Con `consumedAtSource: "user_declared"` → `user_declared`.
- Sin hora → `default_clock`.
- Con hora y sin declaración → `null`. Es el caso de un cliente instalado: conserva la incertidumbre.

**Editar (`mobile_mutate_manual_meal`):**

| La edición trae | Resultado |
| --- | --- |
| `consumedAtSource` | `user_declared`, **aunque el valor sea igual al anterior** |
| Sin `consumedAt` | Se conserva |
| El mismo instante, sin declaración | Se conserva: es el reenvío del borrador |
| Otro día, el mismo reloj de Córdoba, sin declaración | Se conserva: es mover de día |
| Otra hora, sin declaración | `null`: el valor nuevo ya no está respaldado |

Una declaración sin hora, o con cualquier otro valor, se rechaza con `INVALID_MEAL_TIME`. Mobile solo puede declarar `user_declared`: `default_clock` lo decide el servidor y `registration_now` solo existe en ChatGPT.

**Compatibilidad:**
- La clave es opcional y no aparece en los pagos de clientes instalados, así que su hash de idempotencia no cambia.
- Reusar una clave de idempotencia con una declaración agregada es otra solicitud: da `IDEMPOTENCY_KEY_REUSED`.
- `nutritionMealTimeKnown` y `nutritionMealTimeSource` no cambian: «Cuándo comés» y la lectura de Mobile siguen igual.

**ChatGPT v4:** `create_chatgpt_meal_for_integration_v4` y su versión OAuth siguen el patrón de v3. v2 hace las validaciones y la reejecución, y solo una fila recién creada queda marcada. Si v4 todavía no existe (`PGRST202`), el servidor vuelve a v2 y la hora queda sin declarar. Cualquier otro error no reintenta.

## Orden de rollout

### EXPAND (este PR)
1. Aplicar la migración. Es aditiva: columna nullable sin reescritura, más funciones.
2. Desplegar los adaptadores HTTP, que aceptan las claves nuevas.

Mientras tanto ningún cliente las manda, y las RPC ya escriben `default_clock` y `registration_now`.

### ADOPT
PR apilado sobre este, listo pero sin mergear:
1. **Mobile:** solo la hoja de hora marca `user_declared`. Cambiar el momento, mover de día o abrir una edición no marca nada.
2. **Web:** `createMealEntry` escribe `default_clock` si nadie pasó una hora. **Requiere la migración aplicada**: si no, el insert falla.
3. **ChatGPT:** volver a importar el esquema de la acción y agregar `time_stated_by_user` a las instrucciones. Es un paso manual en la configuración del GPT, y lo hace la persona dueña del GPT.

Motor de Insights, en otro PR apilado sobre el método parcial, porque depende de #385: el loader lee la columna. **Requiere la migración aplicada**, o el endpoint responde 503.

| Columna | `raw_input` | Evidencia en el motor |
| --- | --- | --- |
| `user_declared` | Cualquiera | `explicit` |
| `imported` | Cualquiera | `explicit` |
| `registration_now` | Cualquiera | `registration` |
| `default_clock` | Cualquiera | `unknown` |
| `null` | La regla actual | `explicit` solo con la marca de importación; si no, `unverified` |

### OBSERVE
Controlar la proporción de `user_declared` y `null` por productor, sin contenido de las comidas. Hacen falta al menos 20 pares para que una ventana pueda evaluarse, y solo cuentan las comidas posteriores a ADOPT.

### CONTRACT
Nada todavía. `raw_input` sigue siendo la fuente de la lectura legacy y de la importación.

## Validado

En una pila local descartable, con 89 migraciones previas y esta encima (eliminada después: 0 contenedores, 0 volúmenes): creación, edición, registro rápido, los tres ChatGPT y v4 con usuarios reales y RLS. Ver `src/lib/mobile-api/meal-time-provenance.local.test.ts`.

**No validado:** rendimiento del `ALTER TABLE` en producción y el flujo con un GPT real.

## Reversión

Está en el encabezado de la migración: desplegar código que no mande las claves, borrar v4, reaplicar las definiciones anteriores y recién entonces borrar la columna.
