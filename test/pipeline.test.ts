import { describe, expect, it } from "vitest";

import { createWeatherAdvice } from "../src/advice";
import { runWeatherAdvicePipeline } from "../src/index";
import { searchTomorrowWeather, type TomorrowForecast } from "../src/weather";

describe("search_weather", () => {
  it("resolves a city and selects tomorrow in the city's local time zone", async () => {
    const requested: string[] = [];
    const forecast = await searchTomorrowWeather("Belgrade", {
      now: () => new Date("2026-09-26T10:00:00.000Z"),
      fetcher: async (input) => {
        requested.push(String(input));
        if (String(input).includes("geocoding-api")) {
          return Response.json({ results: [{ name: "Belgrade", latitude: 44.7866, longitude: 20.4489, country: "Serbia", admin1: "Belgrade" }] });
        }
        return Response.json(openMeteoForecast());
      },
    });

    expect(requested).toHaveLength(2);
    expect(requested[1]).toContain("forecast_days=3");
    expect(forecast).toMatchObject({
      city: "Belgrade",
      date: "2026-09-27",
      temperatureMinC: 7,
      temperatureMaxC: 14,
      precipitationProbabilityMax: 70,
      weatherCode: 63,
    });
  });
});

describe("summarize_weather", () => {
  it("recommends rain protection and an umbrella for wet and windy weather", () => {
    const advice = createWeatherAdvice(forecast());

    expect(advice.umbrella).toMatchObject({ shouldTake: true });
    expect(advice.clothing.join(" ")).toContain("Ветрозащитная");
    expect(advice.markdown).toContain("# Совет по погоде: Belgrade");
  });
});

describe("automatic MCP pipeline", () => {
  it("calls search, summarize and save in order and persists the summary produced by the second tool", async () => {
    const writes: Array<{ id: string; content: string }> = [];
    const result = await runWeatherAdvicePipeline(
      {
        ASSETS: {} as Fetcher,
        WEATHER_ADVICE_DB: {
          prepare() {
            let values: unknown[] = [];
            const statement = {
              bind(...bound: unknown[]) {
                values = bound;
                return statement;
              },
              async run() {
                writes.push({ id: String(values[0]), content: String(values[4]) });
                return { meta: { last_row_id: 1 } };
              },
            };
            return statement;
          },
        } as unknown as D1Database,
      },
      "Belgrade",
      {
        now: () => new Date("2026-09-26T10:00:00.000Z"),
        fetcher: async (input) => {
          if (String(input).includes("geocoding-api")) {
            return Response.json({ results: [{ name: "Belgrade", latitude: 44.7866, longitude: 20.4489, country: "Serbia", admin1: "Belgrade" }] });
          }
          return Response.json(openMeteoForecast());
        },
      },
    );

    expect(result.steps.map((step) => step.tool)).toEqual(["search_weather", "summarize_weather", "save_to_file"]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(writes[0]?.content).toBe(result.advice.markdown);
    expect(writes[0]?.content).toContain("Осадки: вероятность до 70%");
  });
});

function forecast(): TomorrowForecast {
  return {
    city: "Belgrade",
    country: "Serbia",
    admin1: "Belgrade",
    latitude: 44.7866,
    longitude: 20.4489,
    timezone: "Europe/Belgrade",
    date: "2026-09-27",
    temperatureMinC: 7,
    temperatureMaxC: 14,
    apparentTemperatureMinC: 5,
    apparentTemperatureMaxC: 12,
    precipitationProbabilityMax: 70,
    precipitationSumMm: 3.4,
    weatherCode: 63,
    windSpeedMaxKmh: 34,
    uvIndexMax: 2,
    sunrise: "2026-09-27T06:30",
    sunset: "2026-09-27T18:22",
  };
}

function openMeteoForecast() {
  return {
    timezone: "Europe/Belgrade",
    daily: {
      time: ["2026-09-26", "2026-09-27", "2026-09-28"],
      temperature_2m_min: [10, 7, 8],
      temperature_2m_max: [19, 14, 15],
      apparent_temperature_min: [9, 5, 6],
      apparent_temperature_max: [18, 12, 13],
      precipitation_probability_max: [10, 70, 20],
      precipitation_sum: [0, 3.4, 0.1],
      weather_code: [1, 63, 2],
      wind_speed_10m_max: [8, 34, 10],
      uv_index_max: [3, 2, 4],
      sunrise: ["2026-09-26T06:28", "2026-09-27T06:30", "2026-09-28T06:31"],
      sunset: ["2026-09-26T18:24", "2026-09-27T18:22", "2026-09-28T18:20"],
    },
  };
}
