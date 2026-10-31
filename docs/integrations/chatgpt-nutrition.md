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
- Sin `time`, OWNLEVEL usa el momento de registro para ordenar el día, pero lo marca como horario no informado
  (igual que las comidas importadas): no aparece como hora confirmada ni cuenta en «Cuándo comés».
- Una hora que no corresponde al día local de `date` se rechaza (`400 invalid_request`).
- Desde OWNLEVEL Mobile, las comidas de ChatGPT se editan y borran como las manuales (fecha, hora, tipo, valores),
  con las mismas garantías (CAS, idempotencia, borrado lógico). La procedencia queda guardada internamente.
- Las comidas de ChatGPT anteriores al 28/10/2026 no se reescribieron: conservan la hora de envío como hora.

Dependencia externa: el GPT privado guarda la copia del esquema que importó. Para que envíe `time` y `meal_type`
hay que **volver a importar** el esquema desde la URL de arriba y agregar a sus instrucciones: «Mandá `time` y
`meal_type` sólo si el usuario los dijo». Hasta entonces, sus comidas llegan sin hora (marcadas como no informada).
El conector MCP/OAuth lee el esquema en cada conexión.

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
