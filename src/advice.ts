import type { TomorrowForecast } from "./weather";

export interface WeatherAdvice {
  weatherDescription: string;
  summary: string;
  clothing: string[];
  umbrella: {
    shouldTake: boolean;
    reason: string;
  };
  markdown: string;
}

export function createWeatherAdvice(forecast: TomorrowForecast): WeatherAdvice {
  const weatherDescription = weatherLabel(forecast.weatherCode);
  const clothing = clothingAdvice(forecast);
  const shouldTakeUmbrella = needsUmbrella(forecast);
  const umbrellaReason = shouldTakeUmbrella
    ? umbrellaReasonFor(forecast)
    : "Существенных осадков не ожидается: зонт можно не брать.";
  const location = [forecast.city, forecast.admin1, forecast.country].filter(Boolean).join(", ");
  const summary = `Завтра, ${formatDate(forecast.date)}, в ${location}: ${weatherDescription.toLowerCase()}, от ${round(forecast.temperatureMinC)} до ${round(forecast.temperatureMaxC)} °C. ` +
    `Вероятность осадков — до ${round(forecast.precipitationProbabilityMax)}%, ветер — до ${round(forecast.windSpeedMaxKmh)} км/ч.`;
  const markdown = [
    "# Совет по погоде: " + forecast.city,
    "",
    "**Когда:** " + formatDate(forecast.date) + " (" + forecast.timezone + ")",
    "",
    "## Прогноз",
    "",
    "- " + weatherDescription,
    "- Температура: " + round(forecast.temperatureMinC) + "…" + round(forecast.temperatureMaxC) + " °C (ощущается как " + round(forecast.apparentTemperatureMinC) + "…" + round(forecast.apparentTemperatureMaxC) + " °C)",
    "- Осадки: вероятность до " + round(forecast.precipitationProbabilityMax) + "%, сумма до " + round(forecast.precipitationSumMm) + " мм",
    "- Ветер: до " + round(forecast.windSpeedMaxKmh) + " км/ч",
    forecast.uvIndexMax === null ? null : "- УФ-индекс: до " + round(forecast.uvIndexMax),
    "",
    "## Что надеть",
    "",
    ...clothing.map((item) => "- " + item),
    "",
    "## Зонт",
    "",
    shouldTakeUmbrella ? "**Взять.** " + umbrellaReason : "**Можно не брать.** " + umbrellaReason,
  ].filter((line): line is string => line !== null).join("\n");
  return { weatherDescription, summary, clothing, umbrella: { shouldTake: shouldTakeUmbrella, reason: umbrellaReason }, markdown };
}

function clothingAdvice(forecast: TomorrowForecast): string[] {
  const advice: string[] = [];
  if (forecast.apparentTemperatureMinC <= 0) {
    advice.push("Тёплая куртка или пальто, шапка и перчатки.");
  } else if (forecast.apparentTemperatureMinC <= 8) {
    advice.push("Куртка и тёплый слой: свитер или худи.");
  } else if (forecast.temperatureMaxC >= 26) {
    advice.push("Лёгкая дышащая одежда; на утро можно взять тонкий верхний слой.");
  } else {
    advice.push("Одежда слоями: футболка или рубашка и лёгкая куртка/кардиган.");
  }
  if (forecast.windSpeedMaxKmh >= 30) {
    advice.push("Ветрозащитная верхняя одежда: ожидается заметный ветер.");
  }
  if (isWetWeather(forecast.weatherCode) || forecast.precipitationProbabilityMax >= 40) {
    advice.push("Влагостойкая обувь или непромокаемый верхний слой.");
  }
  if ((forecast.uvIndexMax ?? 0) >= 6) {
    advice.push("Солнцезащитные очки и SPF, особенно днём.");
  }
  return advice;
}

function needsUmbrella(forecast: TomorrowForecast): boolean {
  return isWetWeather(forecast.weatherCode) || forecast.precipitationProbabilityMax >= 40 || forecast.precipitationSumMm >= 0.5;
}

function umbrellaReasonFor(forecast: TomorrowForecast): string {
  if (forecast.precipitationSumMm >= 0.5) {
    return "Модель ожидает до " + round(forecast.precipitationSumMm) + " мм осадков.";
  }
  if (forecast.precipitationProbabilityMax >= 40) {
    return "Вероятность осадков достигает " + round(forecast.precipitationProbabilityMax) + "%.";
  }
  return "В прогнозе указан " + weatherLabel(forecast.weatherCode).toLowerCase() + ".";
}

function isWetWeather(code: number): boolean {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
}

function weatherLabel(code: number): string {
  const labels: Record<number, string> = {
    0: "Ясно",
    1: "Преимущественно ясно",
    2: "Переменная облачность",
    3: "Пасмурно",
    45: "Туман",
    48: "Изморозевый туман",
    51: "Слабая морось",
    53: "Умеренная морось",
    55: "Сильная морось",
    56: "Слабая ледяная морось",
    57: "Сильная ледяная морось",
    61: "Небольшой дождь",
    63: "Дождь",
    65: "Сильный дождь",
    66: "Слабый ледяной дождь",
    67: "Сильный ледяной дождь",
    71: "Небольшой снег",
    73: "Снег",
    75: "Сильный снег",
    77: "Снежные зёрна",
    80: "Слабые ливни",
    81: "Ливни",
    82: "Сильные ливни",
    85: "Слабый снегопад",
    86: "Сильный снегопад",
    95: "Гроза",
    96: "Гроза с небольшим градом",
    99: "Гроза с сильным градом",
  };
  return labels[code] ?? "Неизвестное состояние погоды";
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}
