import "server-only";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { parseChatgptMealInput, type ChatgptMealHttpResult } from "./chatgpt-contract";
import { ownlevelIntegrationOrigin, ownlevelOAuthConfig, ownlevelOAuthEnabled, OWNLEVEL_OAUTH_SCOPES } from "./oauth-config";
import { withOwnlevelOAuth } from "./oauth-auth";
import { readJsonRequestBody, RequestBodyTooLargeError } from "../security/request-body";

export const registerMealTool = {
  name: "register_meal", title: "Registrar comida en OWNLEVEL",
  description: "Registra una comida en tu cuenta. «Subí X comida» sin contexto histórico significa consumo actual: enviá consumed_now=true y omití time si no dijeron una hora. OWNLEVEL resuelve la hora aproximada y el momento automático en Córdoba. Para algo de otro momento («esta mañana», «antes», «ayer»), enviá consumed_now=false aunque sea de hoy; sin hora dicha queda sin hora. Las indicaciones explícitas prevalecen. Conservá la misma idempotency_key al reintentar. Ante possible_duplicate pedí confirmación antes de usar force_duplicate=true. Nunca envíes user_id. El permiso meals:write es interno, no un scope OAuth.",
  inputSchema: { type: "object" as const, additionalProperties: false,
    required: ["title", "description", "calories", "protein_g", "carbs_g", "fat_g", "idempotency_key", "consumed_now"],
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Fecha de consumo en Córdoba. Para consumo actual omitila: el servidor usa hoy. Para otra fecha, enviá la fecha indicada por el usuario." },
      title: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", maxLength: 1000 },
      calories: { type: "integer", minimum: 1, maximum: 100000, description: "Kilocalorías, entero mayor que 0 (misma regla que OWNLEVEL)." },
      protein_g: { anyOf: [{ type: "number", minimum: 0, maximum: 10000 }, { type: "null" }] },
      carbs_g: { anyOf: [{ type: "number", minimum: 0, maximum: 10000 }, { type: "null" }] },
      fat_g: { anyOf: [{ type: "number", minimum: 0, maximum: 10000 }, { type: "null" }] },
      idempotency_key: { type: "string", minLength: 8, maxLength: 200 },
      force_duplicate: { type: "boolean" },
      time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "Sólo si el usuario dijo a qué hora comió (HH:MM, hora de Córdoba). Si no lo dijo, omitilo: OWNLEVEL no inventa la hora." },
      time_stated_by_user: { type: "boolean", description: "true sólo si el usuario dijo esa hora con sus palabras. Omitilo si la dedujiste o si no estás seguro. Requiere time." },
      meal_type: { type: "string", enum: ["breakfast", "lunch", "snack", "dinner", "extra"], description: "Enviá el momento declarado (desayuno=breakfast, almuerzo=lunch, merienda=snack, cena=dinner, extra). Si no lo nombró, omitilo: el servidor lo resuelve desde la hora efectiva y lo distingue como automático. No lo infieras en el complemento." },
      consumed_now: { type: "boolean", description: "Obligatorio. true para «subí X comida», «subí esto» o consumo actual sin contexto histórico: se guarda la hora de registro aproximada. false para una comida anterior, incluso del mismo día («esta mañana», «antes», «ayer»): sin hora explícita queda sin hora ni momento automático. time y meal_type explícitos prevalecen." },
    },
  },
  securitySchemes: [{ type: "oauth2", scopes: OWNLEVEL_OAUTH_SCOPES }],
  _meta: { securitySchemes: [{ type: "oauth2", scopes: OWNLEVEL_OAUTH_SCOPES }] },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
};

/** The arguments break the meal contract; nothing was sent. Its message is user-facing. */
export class McpMealInputError extends Error {}
/** The API call failed or its answer was unreadable: whether the meal was saved is unknown. */
export class McpMealTransportError extends Error {}

export async function forwardOAuthMeal(args: unknown, bearer: string, fetcher: typeof fetch = fetch) {
  let meal: ReturnType<typeof parseChatgptMealInput>;
  try { meal = parseChatgptMealInput(args); }
  catch (error) { throw new McpMealInputError(error instanceof Error ? error.message : "La solicitud no es válida."); }
  if (typeof (args as Record<string, unknown>).consumed_now !== 'boolean') {
    throw new McpMealInputError('Indicá consumed_now: true para consumo actual o false para una comida anterior, incluso de hoy.');
  }
  const { force_duplicate, consumed_at, meal_type, consumed_now, time_stated, ...fields } = meal;
  // The route takes the time as the user said it ("HH:MM"), never the composed instant.
  const time = consumed_at ? consumed_at.slice(11, 16) : null;
  const payload = { ...fields, consumed_now, ...(force_duplicate ? { force_duplicate: true } : {}), ...(time ? { time } : {}), ...(time_stated ? { time_stated_by_user: true } : {}), ...(meal_type ? { meal_type } : {}) };
  // Fixed origin/resource, no user-controlled destination or redirect following.
  const endpoint = new URL(ownlevelIntegrationOrigin());
  // Disposable local tests keep the canonical HTTPS resource/audience, but
  // must never write to production. This override is forbidden in production.
  endpoint.pathname = "/api/integrations/chatgpt/meals";
  let response: Response, body: ChatgptMealHttpResult["body"];
  try {
    response = await fetcher(endpoint, { method: "POST", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(10_000), headers: { "Authorization": bearer, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    body = await response.json() as ChatgptMealHttpResult["body"];
  } catch { throw new McpMealTransportError("meal_api_unreachable"); }
  return { status: response.status, body };
}

function toolError(message: string, challenge?: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true,
    ...(challenge ? { _meta: { "mcp/www_authenticate": [challenge] } } : {}) };
}

export type McpMealFailureCode = "invalid_request" | "temporarily_unavailable" | "internal_error";

/** A failure the model can tell apart by `error`; never internal detail, tokens or the meal payload. */
function mealFailure(error: McpMealFailureCode, message: string) {
  const body = { ok: false as const, error, message };
  return { content: [{ type: "text" as const, text: JSON.stringify(body) }], structuredContent: body, isError: true };
}

const RETRY_SAME_KEY = "Si reintentás, usá la misma idempotency_key: no se duplica.";

export async function handleMealsMcp(req: Request) {
  if (!ownlevelOAuthEnabled()) return Response.json({ error: "integration_disabled" }, { status: 503 });
  if (req.headers.get("origin") && ![ownlevelIntegrationOrigin(), "https://chatgpt.com"].includes(req.headers.get("origin")!)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  let parsedBody: unknown;
  if (req.method === "POST") {
    try { ({ body: parsedBody } = await readJsonRequestBody(req, 32_768)); }
    catch (error) { return Response.json({ error: "invalid_request" }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400 }); }
  }
  const server = new Server({ name: "ownlevel-meals", version: "2.0.0" }, { capabilities: { tools: {} } });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 32_768 });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [registerMealTool] }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (params.name !== "register_meal") return toolError("Herramienta desconocida.");
    try {
      // Discovery/initialize are public. Every actual invocation is authenticated
      // and authorized before forwarding; tools/list never implies permission.
      let result: Awaited<ReturnType<typeof forwardOAuthMeal>> | undefined;
      // Caught inside the gate so a failure after authorization is never reported as missing authorization.
      let failure: unknown;
      const authRequest = new Request(req.url, { headers: req.headers });
      const response = await withOwnlevelOAuth(authRequest, async () => {
        try { result = await forwardOAuthMeal(params.arguments, req.headers.get("authorization")!); }
        catch (error) { failure = error ?? new Error("unknown"); }
        return new Response(null, { status: 204 });
      });
      if (failure instanceof McpMealInputError) return mealFailure("invalid_request", failure.message);
      if (failure instanceof McpMealTransportError) {
        console.error("[ownlevel-mcp] register_meal temporarily_unavailable");
        return mealFailure("temporarily_unavailable", `No se pudo confirmar si la comida quedó registrada. ${RETRY_SAME_KEY}`);
      }
      if (failure) throw failure;
      if (!result && response.status >= 500) {
        console.error("[ownlevel-mcp] register_meal authorization_unavailable");
        return mealFailure("temporarily_unavailable", `No se pudo verificar la conexión con OWNLEVEL. ${RETRY_SAME_KEY}`);
      }
      if (!result) return toolError("Conectá OWNLEVEL y autorizá el registro de comidas.", response.headers.get("WWW-Authenticate") ?? undefined);
      if (result.status === 401 || result.status === 403) {
        const config = ownlevelOAuthConfig();
        return toolError("La conexión no tiene permiso vigente.", `Bearer resource_metadata="${config.metadataUrl}", error="${result.status === 401 ? "invalid_token" : "insufficient_scope"}"`);
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result.body) }], structuredContent: result.body, isError: !result.body.ok };
    } catch {
      console.error("[ownlevel-mcp] register_meal internal_error");
      return mealFailure("internal_error", `No se pudo registrar la comida. ${RETRY_SAME_KEY}`);
    }
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(req, { parsedBody });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally { await server.close(); }
}
