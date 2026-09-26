import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

import { createWeatherAdvice, type WeatherAdvice } from "./advice";
import { loadAdviceFile, saveAdviceFile, type SavedAdviceFile } from "./storage";
import { searchTomorrowWeather, type TomorrowForecast, type WeatherSearchDependencies } from "./weather";

interface Env {
  ASSETS: Fetcher;
  WEATHER_ADVICE_DB: D1Database;
}

const citySchema = z.string().trim().min(2).max(100);
const forecastSchema = z.object({
  city: z.string(),
  country: z.string().nullable(),
  admin1: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  temperatureMinC: z.number(),
  temperatureMaxC: z.number(),
  apparentTemperatureMinC: z.number(),
  apparentTemperatureMaxC: z.number(),
  precipitationProbabilityMax: z.number(),
  precipitationSumMm: z.number(),
  weatherCode: z.number(),
  windSpeedMaxKmh: z.number(),
  uvIndexMax: z.number().nullable(),
  sunrise: z.string().nullable(),
  sunset: z.string().nullable(),
});

export interface PipelineStep {
  tool: "search_weather" | "summarize_weather" | "save_to_file";
  status: "completed";
}

export interface WeatherPipelineResult {
  forecast: TomorrowForecast;
  advice: WeatherAdvice;
  file: SavedAdviceFile;
  steps: PipelineStep[];
}

export function createWeatherAdviceMcpServer(env: Env, dependencies: WeatherSearchDependencies = {}): McpServer {
  const server = new McpServer({
    name: "Tomorrow weather advice MCP",
    version: "1.0.0",
  });

  server.registerTool(
    "search_weather",
    {
      description: "Находит город через Open-Meteo и возвращает подробный прогноз погоды на завтра.",
      inputSchema: { city: citySchema.describe("Название города, например Belgrade или Нови-Сад.") },
    },
    async ({ city }) => {
      try {
        const forecast = await searchTomorrowWeather(city, dependencies);
        return okTool("Прогноз на завтра для " + forecast.city + " получен.", forecast);
      } catch (error) {
        return errorTool(error);
      }
    },
  );

  server.registerTool(
    "summarize_weather",
    {
      description: "Преобразует переданный прогноз на завтра в русское саммари и практичный совет по одежде и зонту.",
      inputSchema: { forecast: forecastSchema },
    },
    async ({ forecast }) => {
      try {
        const advice = createWeatherAdvice(forecast);
        return okTool(advice.summary, advice);
      } catch (error) {
        return errorTool(error);
      }
    },
  );

  server.registerTool(
    "save_to_file",
    {
      description: "Сохраняет готовый Markdown-совет как постоянный скачиваемый файл и возвращает его идентификатор.",
      inputSchema: {
        city: z.string().min(1).max(100),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        content: z.string().min(1).max(20_000),
      },
    },
    async ({ city, date, content }) => {
      try {
        const file = await saveAdviceFile(env.WEATHER_ADVICE_DB, { city, date, content });
        return okTool("Файл сохранён: " + file.filename, file);
      } catch (error) {
        return errorTool(error);
      }
    },
  );

  return server;
}

/**
 * The UI agent uses a real in-memory MCP client/server pair. This keeps the
 * exact MCP schemas and tool calls in the automatic chain without making a
 * recursive HTTP request from a Worker to itself.
 */
export async function runWeatherAdvicePipeline(
  env: Env,
  city: string,
  dependencies: WeatherSearchDependencies = {},
): Promise<WeatherPipelineResult> {
  const server = createWeatherAdviceMcpServer(env, dependencies);
  const client = new Client(
    { name: "weather-advice-ui-agent", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const steps: PipelineStep[] = [];
  try {
    const forecast = await callTool<TomorrowForecast>(client, "search_weather", { city });
    steps.push({ tool: "search_weather", status: "completed" });
    const advice = await callTool<WeatherAdvice>(client, "summarize_weather", { forecast });
    steps.push({ tool: "summarize_weather", status: "completed" });
    const file = await callTool<SavedAdviceFile>(client, "save_to_file", {
      city: forecast.city,
      date: forecast.date,
      content: advice.markdown,
    });
    steps.push({ tool: "save_to_file", status: "completed" });
    return { forecast, advice, file, steps };
  } finally {
    await client.close();
    await server.close();
  }
}

async function callTool<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(textFromContent(result.content));
  }
  if (!result.structuredContent || typeof result.structuredContent !== "object") {
    throw new Error("MCP tool " + name + " returned no structured content.");
  }
  return result.structuredContent as T;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === "/health") {
      return json({ status: "ok", service: "tomorrow-weather-advice-mcp", mcp_endpoint: "/mcp" });
    }
    if (url.pathname === "/mcp") {
      const handleMcp = createMcpHandler(() => createWeatherAdviceMcpServer(env), { route: "/mcp" });
      return handleMcp(request, env, ctx);
    }
    if (url.pathname === "/api/advice") {
      if (request.method !== "POST") {
        return json({ error: "Only POST is supported." }, 405);
      }
      return handleAdviceRequest(request, env, url.origin);
    }
    if (url.pathname.startsWith("/files/")) {
      return serveSavedFile(url, env);
    }
    if (request.method === "GET") {
      return env.ASSETS.fetch(request);
    }
    return json({ error: "Not found." }, 404);
  },
} satisfies ExportedHandler<Env>;

async function handleAdviceRequest(request: Request, env: Env, origin: string): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  const city = typeof payload === "object" && payload !== null && "city" in payload
    ? citySchema.safeParse((payload as { city?: unknown }).city)
    : citySchema.safeParse(undefined);
  if (!city.success) {
    return json({ error: "Введите название города от 2 до 100 символов." }, 400);
  }
  try {
    const result = await runWeatherAdvicePipeline(env, city.data);
    return json({
      ...result,
      file: { ...result.file, url: origin + "/files/" + result.file.id + ".md" },
    });
  } catch (error) {
    return json({ error: messageOf(error) }, 502);
  }
}

async function serveSavedFile(url: URL, env: Env): Promise<Response> {
  const id = decodeURIComponent(url.pathname.slice("/files/".length).replace(/\.md$/, ""));
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return json({ error: "Not found." }, 404);
  }
  const file = await loadAdviceFile(env.WEATHER_ADVICE_DB, id);
  if (!file) {
    return json({ error: "File not found." }, 404);
  }
  return new Response(file.content, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": "attachment; filename=\"" + file.filename + "\"",
      "Cache-Control": "private, max-age=300",
    },
  });
}

function okTool(text: string, structuredContent: object) {
  return { content: [{ type: "text" as const, text }], structuredContent };
}

function errorTool(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: "Ошибка: " + messageOf(error) }],
    structuredContent: { status: "error", error: messageOf(error) },
  };
}

function textFromContent(content: unknown): string {
  if (Array.isArray(content)) {
    const item = content.find(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" && block !== null &&
        "type" in block && (block as { type?: unknown }).type === "text" &&
        "text" in block && typeof (block as { text?: unknown }).text === "string",
    );
    if (item) return item.text;
  }
  return "MCP tool failed without an error message.";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version, Mcp-Session-Id",
  };
}
