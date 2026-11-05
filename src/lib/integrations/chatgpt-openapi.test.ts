import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const schemaPath = "docs/integrations/ownlevel-chatgpt-action.openapi.yaml";
const schema = readFileSync(schemaPath, "utf8");

describe("OWNLEVEL ChatGPT OpenAPI", () => {
  it("describe las rutas reales y sus operationIds estables", () => {
    expect(existsSync("src/app/api/integrations/chatgpt/status/route.ts")).toBe(true);
    expect(existsSync("src/app/api/integrations/chatgpt/meals/route.ts")).toBe(true);
    expect(existsSync("src/app/api/integrations/chatgpt/openapi/route.ts")).toBe(true);
    expect(schema).toContain("/api/integrations/chatgpt/status:");
    expect(schema).toContain("operationId: checkConnection");
    expect(schema).toContain("/api/integrations/chatgpt/meals:");
    expect(schema).toContain("operationId: logMeal");
  });

  it("usa Bearer y mantiene schemas cerrados sin secretos", () => {
    expect(schema).toContain("type: http");
    expect(schema).toContain("scheme: bearer");
    expect(schema).toContain("additionalProperties: false");
    expect(schema).toContain("null significa desconocido");
    expect(schema).toContain("idempotency_key");
    expect(schema).toContain("force_duplicate");
    expect(schema).toContain("possible_duplicate");
    expect(schema).not.toMatch(/ownlevel_[A-Za-z0-9_-]{43}/);
    expect(schema).not.toMatch(/service[_-]?role/i);
  });

  it("status sólo declara ok y connected", () => {
    const statusSchema = schema.slice(
      schema.indexOf("ConnectionSuccess:"),
      schema.indexOf("MealInput:"),
    );
    expect(statusSchema).toContain("required: [ok, connected]");
    expect(statusSchema).not.toMatch(
      /email|user_id|calories|protein|carbs|fat|weight|steps|token/i,
    );
  });

  it("logMeal no expone acumulados ni objetivos nutricionales", () => {
    const successSchema = schema.slice(
      schema.indexOf("MealSuccess:"),
      schema.indexOf("Error:"),
    );
    expect(successSchema).toContain(
      "required: [ok, created, idempotent_replay, meal]",
    );
    expect(successSchema).not.toMatch(/day:|total_|target_/i);
  });
});

describe("#367: lo que el GPT puede declarar sobre la hora", () => {
  const mealInput = schema.slice(schema.indexOf("    MealInput:"), schema.indexOf("    MealSuccess:"));
  const openApiFields = [...mealInput.matchAll(/^ {8}([a-z_]+):$/gm)].map(match => match[1]).sort();

  it("el esquema importado, la herramienta MCP y el parser aceptan los mismos campos", async () => {
    const { CHATGPT_MEAL_INPUT_KEYS } = await import("./chatgpt-contract");
    const { registerMealTool } = await import("./mcp-meals");
    expect(openApiFields).toEqual([...CHATGPT_MEAL_INPUT_KEYS].sort());
    expect(Object.keys(registerMealTool.inputSchema.properties).sort()).toEqual([...CHATGPT_MEAL_INPUT_KEYS].sort());
  });

  it("describe hora declarada, hora aproximada de ahora, hora desconocida y momento nombrado", async () => {
    const { registerMealTool } = await import("./mcp-meals");
    const mcp = `${registerMealTool.description} ${JSON.stringify(registerMealTool.inputSchema.properties)}`;
    for (const text of [schema, mcp]) {
      expect(text).toContain("time_stated_by_user");
      expect(text).toMatch(/s[oó]lo si el usuario dijo/);
      expect(text).toMatch(/hora (de registro )?aproximada|hora aproximada de\s+registro/);
      expect(text).toMatch(/sin hora|desconocida/);
      expect(text).toMatch(/nunca lo deduzcas por la hora|No lo infieras/);
    }
    // A new version tells the owner, in the GPT editor, that the imported copy is the current one.
    expect(schema).toContain("version: 1.4.0");
  });
});
