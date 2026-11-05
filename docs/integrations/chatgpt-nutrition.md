# Conectar ChatGPT con OWNLEVEL

## Mecanismo vigente

OWNLEVEL usa una **GPT Action privada** configurada en un GPT existente. Es el
mecanismo más corto para esta cuenta: Actions continúa aceptando un esquema
OpenAPI y autenticación API Key, mientras que OWNLEVEL conserva su API separada
de OpenAI.

OWNLEVEL no llama a OpenAI, no procesa fotos y no almacena imágenes. Recibe una
comida ya estructurada y sólo expone dos operaciones write-only:

- `checkConnection`: valida la clave sin devolver datos personales ni
  nutricionales;
- `logMeal`: registra una comida canónica.

La disponibilidad para crear o publicar GPTs personales puede variar según el
plan y los permisos de la cuenta. Este flujo fue validado con la cuenta Plus y el
GPT privado existente, que continúa editable. No se construyó MCP, OAuth ni una
app publicable innecesaria.

## Configuración

1. Abrí **Ajustes → Nutrición → Integraciones**.
2. Elegí **Crear clave** y copiala en ese momento. El valor raw se muestra una
   sola vez; OWNLEVEL persiste únicamente su SHA-256.
3. Abrí la configuración del GPT privado existente y agregá o editá su Action.
4. Importá este esquema desde una URL:

   ```text
   https://www.ownlevel.fit/api/integrations/chatgpt/openapi
   ```

5. En **Authentication**, elegí **API Key**, tipo **Bearer**, y pegá la clave de
   OWNLEVEL.
6. Guardá los cambios y probá primero `checkConnection`. La respuesta esperada
   es:

   ```json
   { "ok": true, "connected": true }
   ```

7. Confirmá en OWNLEVEL que **Último uso** dejó de mostrar `Nunca`.
8. Probá `logMeal` con una comida controlada y verificá que aparezca en Today.

## Contrato de comidas

La fecha omitida se resuelve usando `America/Argentina/Cordoba`. En macros,
`null` significa desconocido y `0` significa conocido y realmente cero. No se
deben inventar valores para completar campos opcionales.

El GPT debe mantener la misma `idempotency_key` al reintentar una misma acción.
El replay responde `created=false` e `idempotent_replay=true` sin crear otra
fila.

La respuesta de escritura confirma únicamente el estado de la operación y la
comida recién enviada. No incluye acumulados, objetivos ni otros datos del día.

### Hora y tipo de comida (#308)

- `time` (`HH:MM`, hora de Córdoba del día en `date`) y `meal_type` (`breakfast`, `lunch`, `snack`, `dinner`,
  `extra`) son opcionales. Se envían **sólo** si el usuario los dijo; el GPT no los deduce por la hora de envío.
- MCP exige `consumed_now` booleano. «Subí X comida» sin contexto histórico envía `true`; una comida de otro
  momento («antes», «esta mañana», «ayer») envía `false`, incluso del mismo día. No se decide por `date === today`.
  Si falta esa señal, MCP rechaza antes de enviar una escritura. La API legacy conserva su valor por defecto
  `false` para clientes anteriores. El transporte conserva explícitamente el `false`.
- Sin `time` y con `consumed_now:false`, la marca de registro sólo ordena el día: la hora sigue `unknown`,
  sin momento automático. No aparece como hora confirmada ni cuenta en «Cuándo comés».
- **Comida de ahora** (`consumed_now: true`, sin `time`): el usuario registra lo que está comiendo o acaba de comer
  («subí esto», «estoy almorzando»). OWNLEVEL guarda el instante de registro (reloj de la base, no del mensaje) como
  hora **aproximada**, con procedencia `registration`. Web y Mobile la muestran como «≈ 13:42», nunca como hora dicha.
  Para consumo actual se puede omitir `date`: el servidor usa hoy en Córdoba. Una fecha explícita diferente se
  rechaza con `400 invalid_request`, incluido el cruce de medianoche; no se cambia silenciosamente de día.
- **Momento automático, resuelto por el servidor:** si no hay `meal_type` declarado y la hora efectiva es
  `explicit` o `registration`, la lectura de Mobile API entrega `automaticMealLabel`: desayuno 05:00–10:59,
  almuerzo 11:00–14:59, merienda 15:00–18:59, cena 19:00–22:59 y extra 23:00–04:59, siempre en Córdoba.
  Usa `consumed_at`, no la hora de abrir la pantalla ni la del dispositivo. Aplica sólo a comidas ChatGPT.
  Diario muestra «Cena (automática)» en lista y detalle, junto a la hora (aproximada cuando corresponde).
  `mealLabel` sigue siendo lo declarado; `automaticMealLabel` es una proyección de lectura separada, nunca se
  copia al formulario ni a una escritura. No se reescriben filas ni se modifica la clasificación histórica
  persistida. Si se cambia la hora desde la app, el servidor deriva el momento de la nueva hora; un tipo
  declarado prevalece. Comidas con hora desconocida, incluso de hoy, no reciben momento automático.
- Procedencia de la hora: `explicit` (dicha por el usuario o puesta desde la app), `registration` (aproximada) o
  `unknown`. «Cuándo comés» cuenta sólo las `explicit`: las horas aproximadas no cambian las estadísticas ni se
  reinterpretan datos viejos. Corregir la hora desde la app la vuelve `explicit`, sin duplicar la comida.
- `time_stated_by_user: true` declara que el usuario dijo esa hora con sus palabras (requiere `time`). Sin esa declaración la hora se guarda igual, pero su origen queda desconocido y no entra en las ventanas de Insights. Ver [procedencia](../progress/367-meal-time-provenance.md) y el [paso manual](#paso-manual-actualizar-las-conexiones-de-chatgpt-367).
- `time` prevalece siempre sobre `consumed_now`; `meal_type` dicho prevalece sobre el momento automático.
- Una hora que no corresponde al día local de `date` se rechaza (`400 invalid_request`).
- Desde OWNLEVEL Mobile, las comidas de ChatGPT se editan y borran como las manuales (fecha, hora, tipo, valores),
  con las mismas garantías (CAS, idempotencia, borrado lógico). La procedencia queda guardada internamente.
- Las comidas de ChatGPT anteriores al 28/10/2026 no se reescribieron: conservan la hora de envío como hora.

Dependencia externa: el GPT privado guarda la copia del esquema que importó. Para que envíe `time`, `meal_type` y
`consumed_now` hay que **volver a importar** el esquema desde la URL de arriba y agregar a sus instrucciones:
«Mandá `time` y `meal_type` sólo si el usuario los dijo. Para “subí X comida” sin contexto histórico mandá
`consumed_now:true`; para una comida anterior, incluso de hoy, `consumed_now:false`. Omití `date` para consumo
actual. El servidor resuelve hora y momento; no inventes valores explícitos».
Después del despliegue de este descriptor, refrescar OWNLEVEL Comidas y abrir una conversación nueva para
que use la señal obligatoria. MCP y GPT privado/Actions son configuraciones independientes.
`consumed_now` requiere la migración
`20261031210000_chatgpt_meal_registration_time_expand.sql` (PR propio de EXPAND); sin ella, la comida se guarda
como antes (sin hora). El cambio de momento automático no agrega migraciones: usa esa procedencia ya persistida.
Para ver el campo aditivo en lista y detalle hay que actualizar Diario; versiones anteriores ignoran el campo.

### QA físico de hora ausente — investigación separada

El fallo de Diario `cbf039f` está registrado en [#308](https://github.com/IS03/Ownlevel/issues/308#issuecomment-6551929581).
Lecturas posteriores comprobaron procedencia `registration` en los tres registros reportados, ya borrados
lógicamente por el usuario. No se restauraron ni se crearon comidas para diagnosticar.
Una lectura autenticada de producción de una comida existente conservó exactamente `consumedAt`, `timeKnown`,
`timeSource` y `mealLabel` al atravesar el parser; los componentes reales del simulador mostraron su hora
aproximada en lista y detalle. El bytecode de Diario contiene esas condiciones. Esto no identifica la causa
de la diferencia observada en el iPhone: queda pendiente comprobar cierre completo/reapertura, actualización
del día y lista/detalle de esa comida existente. El momento automático nuevo no se presenta como arreglo
demostrado de la hora ausente. Mantener #308 abierto hasta validar ambos puntos en el teléfono.

Si OWNLEVEL responde `409 possible_duplicate`, el GPT debe pedir confirmación.
Sólo cuando el usuario confirme que fue otra comida puede reenviar con una
`idempotency_key` nueva y `force_duplicate=true`.

Las calorías son un entero mayor que 0 en todas las superficies (Action, MCP y API); los macros aceptan 0 o
`null`. Errores de `register_meal` en el MCP (#346), en `structuredContent.error`:

| Código | Significa | Qué hacer |
| --- | --- | --- |
| `invalid_request` | Los datos no cumplen el contrato; no se envió nada. | Corregir el dato que nombra el mensaje. |
| `possible_duplicate` | Hay una comida idéntica reciente. | Confirmar con el usuario antes de `force_duplicate`. |
| `temporarily_unavailable` | Falló la red o la verificación; no se sabe si quedó guardada. | Reintentar con la misma `idempotency_key`. |
| `internal_error` | OWNLEVEL no pudo guardarla. | Reintentar con la misma `idempotency_key`. |

Los permisos vencidos o revocados vuelven como pedido de autorización, no como error de comida. Los logs registran
sólo el código del error (y el SQLSTATE si falló la base), nunca el token ni la comida.

## Revocación y diagnóstico

Revocar la clave la invalida inmediatamente. Después puede crearse otra. El
endpoint de estado usa exactamente la misma autenticación y scope
`meals:write` que el endpoint de comidas; no habilita permisos de lectura.

Ante un `401`, revisar que la clave siga activa y que la Action esté configurada
como API Key **Bearer**, no como header personalizado ni OAuth. Ante un `500`,
revisar los logs del deployment sin registrar la credencial.

Fuentes oficiales consultadas al definir este flujo:

- https://developers.openai.com/api/docs/actions/authentication
- https://developers.openai.com/api/docs/actions/getting-started
- https://help.openai.com/en/articles/8554397-creating-and-editing-gpts
- https://developers.openai.com/api/docs/guides/developer-mode

## Paso manual: actualizar las conexiones de ChatGPT (#367)

Producción ya publica `time_stated_by_user` en los dos descriptores; lo comprobé con lecturas anónimas, sin credenciales:
`GET /api/integrations/chatgpt/openapi` y `tools/list` de `POST /mcp`. **Publicar el archivo no cambia una conexión
ya instalada:** ChatGPT guarda su propia copia. Son dos conexiones independientes y cada una se actualiza por separado.

| Conexión | Qué guarda ChatGPT | Cómo se actualiza |
| --- | --- | --- |
| GPT privado con Action (OpenAPI) | La copia del esquema que se importó | El dueño vuelve a importarlo |
| Conector OWNLEVEL Comidas (MCP) | La lista de herramientas leída al conectar | El dueño la refresca desde la configuración del conector |

**1. GPT privado.** En el editor del GPT, **Configure → Actions → la Action de OWNLEVEL → Import from URL**:

```text
https://www.ownlevel.fit/api/integrations/chatgpt/openapi
```

Agregar a sus instrucciones, tal cual:

> Para la hora de una comida: mandá `time` y `time_stated_by_user: true` solo si el usuario dijo la hora con sus
> palabras. Si la dedujiste, no la declares. Sin hora dicha, mandá `consumed_now: true` si come ahora (OWNLEVEL
> guarda una hora aproximada) y `consumed_now: false` si fue antes (la hora queda desconocida). Mandá `meal_type`
> solo si el usuario nombró la comida; nunca lo deduzcas por la hora.

**Comprobación:** en el editor de esquema importado figuran `version: 1.4.0` y `time_stated_by_user`. Guardar el GPT.

**2. Conector MCP.** En ChatGPT, **Configuración → Apps y conectores → OWNLEVEL Comidas → Actualizar** (o desconectar y
volver a conectar si la opción no aparece; los nombres del menú cambian entre versiones de ChatGPT). La descripción de la herramienta ya lleva la regla; no hace falta otro texto.

**Comprobación:** en el detalle de `register_meal` aparece el parámetro `time_stated_by_user`. Abrir una conversación
nueva: las ya abiertas conservan la lista anterior.

**Después, con uso normal y sin comidas de prueba:** la próxima comida con hora dicha aparece en Diario con su hora, y
Insights la cuenta en las ventanas de comida. Si no, la conexión sigue usando la copia vieja. No hace falta registrar
nada para comprobar los pasos 1 y 2.
