# #367 — ChatGPT: cuándo una hora cuenta como dicha

**Base: `main`.** No necesita migración ni otro PR. Se puede mergear sola.

## Qué estaba bien y qué no

**El camino funcionaba de punta a punta:** contrato → esquema publicado → handler → RPC → `consumed_at_source`.
- Producción ya publica `time_stated_by_user` en `GET /api/integrations/chatgpt/openapi` y en `tools/list` de `/mcp`. Lo leí sin credenciales.
- El motor no usa `meal_label`: nunca infiere el momento por el reloj.

**El desajuste era de instrucciones:**
- La regla de cuándo declarar una hora estaba solo en la descripción del campo.
- La versión del esquema seguía en 1.3.0, así que en el editor del GPT no se podía saber si la copia importada era la actual.

## Cambios

**Descripciones.** La operación `logMeal` y la herramienta `register_meal` dicen cuándo mandar:
- `time_stated_by_user`;
- `consumed_now=true` (hora aproximada) y `consumed_now=false` (hora desconocida);
- `meal_type`, solo si se nombró la comida.

**Versiones.** Esquema 1.4.0 y servidor MCP 2.1.0.

**Prueba.** El parser, el esquema OpenAPI y la herramienta MCP aceptan exactamente los mismos campos, y los dos descriptores describen los cuatro casos.

**Paso manual exacto**, para cada conexión instalada y con su comprobación: [chatgpt-nutrition.md](../integrations/chatgpt-nutrition.md#paso-manual-actualizar-las-conexiones-de-chatgpt-367). Publicar el archivo no actualiza una copia que ChatGPT ya guardó.

## Validación

`src/lib/integrations` y `meal-time-provenance.test.ts`: 115 pruebas. `tsc` y ESLint de los archivos tocados.

**No registré comidas de prueba en producción** ni entré a ninguna configuración externa.
