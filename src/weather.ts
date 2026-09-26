export interface TomorrowForecast {
  city: string;
  country: string | null;
  admin1: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  date: string;
  temperatureMinC: number;
  temperatureMaxC: number;
  apparentTemperatureMinC: number;
  apparentTemperatureMaxC: number;
  precipitationProbabilityMax: number;
  precipitationSumMm: number;
  weatherCode: number;
  windSpeedMaxKmh: number;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}

interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

interface GeocodingPayload {
  results?: GeocodingResult[];
}

interface ForecastPayload {
  timezone?: string;
  daily?: {
    time?: string[];
    temperature_2m_min?: number[];
    temperature_2m_max?: number[];
    apparent_temperature_min?: number[];
    apparent_temperature_max?: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
    weather_code?: number[];
    wind_speed_10m_max?: number[];
    uv_index_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
}

export interface WeatherSearchDependencies {
  fetcher?: typeof fetch;
  now?: () => Date;
}

export async function searchTomorrowWeather(
  city: string,
  dependencies: WeatherSearchDependencies = {},
): Promise<TomorrowForecast> {
  const fetcher = dependencies.fetcher ?? fetch;
  const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodingUrl.search = new URLSearchParams({
    name: city.trim(),
    count: "1",
    language: "ru",
    format: "json",
  }).toString();
  const geocodingResponse = await fetcher(geocodingUrl);
  if (!geocodingResponse.ok) {
    throw new Error("Open-Meteo geocoding is unavailable (HTTP " + geocodingResponse.status + ").");
  }
  const geocoding = await geocodingResponse.json<GeocodingPayload>();
  const place = geocoding.results?.[0];
  if (!place || !isFiniteNumber(place.latitude) || !isFiniteNumber(place.longitude) || !place.name) {
    throw new Error("Город не найден. Проверьте название и попробуйте ещё раз.");
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "apparent_temperature_min",
      "precipitation_probability_max",
      "precipitation_sum",
      "wind_speed_10m_max",
      "uv_index_max",
      "sunrise",
      "sunset",
    ].join(","),
    forecast_days: "3",
    timezone: "auto",
  }).toString();
  const forecastResponse = await fetcher(forecastUrl);
  if (!forecastResponse.ok) {
    throw new Error("Open-Meteo forecast is unavailable (HTTP " + forecastResponse.status + ").");
  }
  const forecast = await forecastResponse.json<ForecastPayload>();
  const timezone = typeof forecast.timezone === "string" ? forecast.timezone : "UTC";
  const tomorrow = nextLocalDate(timezone, dependencies.now?.() ?? new Date());
  const daily = forecast.daily;
  const index = daily?.time?.indexOf(tomorrow) ?? -1;
  if (!daily || index === -1) {
    throw new Error("Open-Meteo did not return a forecast for tomorrow.");
  }

  return {
    city: place.name,
    country: optionalText(place.country),
    admin1: optionalText(place.admin1),
    latitude: place.latitude,
    longitude: place.longitude,
    timezone,
    date: tomorrow,
    temperatureMinC: requiredDailyNumber(daily.temperature_2m_min, index, "temperature_2m_min"),
    temperatureMaxC: requiredDailyNumber(daily.temperature_2m_max, index, "temperature_2m_max"),
    apparentTemperatureMinC: requiredDailyNumber(daily.apparent_temperature_min, index, "apparent_temperature_min"),
    apparentTemperatureMaxC: requiredDailyNumber(daily.apparent_temperature_max, index, "apparent_temperature_max"),
    precipitationProbabilityMax: requiredDailyNumber(
      daily.precipitation_probability_max,
      index,
      "precipitation_probability_max",
    ),
    precipitationSumMm: requiredDailyNumber(daily.precipitation_sum, index, "precipitation_sum"),
    weatherCode: requiredDailyNumber(daily.weather_code, index, "weather_code"),
    windSpeedMaxKmh: requiredDailyNumber(daily.wind_speed_10m_max, index, "wind_speed_10m_max"),
    uvIndexMax: optionalDailyNumber(daily.uv_index_max, index),
    sunrise: optionalDailyText(daily.sunrise, index),
    sunset: optionalDailyText(daily.sunset, index),
  };
}

function nextLocalDate(timezone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) {
    throw new Error("Could not determine the forecast location time zone.");
  }
  const todayUtc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return new Date(todayUtc + 86_400_000).toISOString().slice(0, 10);
}

function requiredDailyNumber(values: number[] | undefined, index: number, name: string): number {
  const value = values?.[index];
  if (!isFiniteNumber(value)) {
    throw new Error("Open-Meteo returned an invalid " + name + " value.");
  }
  return value;
}

function optionalDailyNumber(values: number[] | undefined, index: number): number | null {
  const value = values?.[index];
  return isFiniteNumber(value) ? value : null;
}

function optionalDailyText(values: string[] | undefined, index: number): string | null {
  const value = values?.[index];
  return typeof value === "string" && value ? value : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
