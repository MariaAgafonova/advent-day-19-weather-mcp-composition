# День 19 — композиция MCP-инструментов для совета по погоде

Публичное приложение: <https://advent-day-19-weather-mcp-composition.advent-day-18-scheduled-mcp.workers.dev>

Публичный MCP endpoint: <https://advent-day-19-weather-mcp-composition.advent-day-18-scheduled-mcp.workers.dev/mcp>

Пользователь вводит город в UI. Встроенный агент запускает реальную in-memory MCP client/server сессию и строго последовательно вызывает три инструмента:

```text
search_weather(city)
  -> TomorrowForecast from Open-Meteo
summarize_weather(forecast)
  -> WeatherAdvice with clothing and umbrella guidance
save_to_file(city, date, advice.markdown)
  -> downloadable Markdown file
```

Ни один следующий инструмент не запускается, пока не вернётся `structuredContent` предыдущего. У каждого инструмента есть собственная Zod-схема входных параметров.

## MCP-инструменты

- `search_weather(city)` — геокодирует город и получает через Open-Meteo прогноз именно на следующий локальный календарный день. Возвращает температуру, ощущаемую температуру, вероятность и сумму осадков, ветер, УФ-индекс и погодный код.
- `summarize_weather(forecast)` — принимает результат первого инструмента, создаёт русское саммари, список одежды и решение по зонту. Логика детерминированна, поэтому её легко тестировать.
- `save_to_file(city, date, content)` — сохраняет Markdown-файл и возвращает его `id`, имя и размер.

R2 в текущем Cloudflare-аккаунте не активирован (Cloudflare API вернул код `10042`), поэтому постоянное хранилище реализовано на D1. UI выдаёт файл по `/files/<id>.md` с `Content-Disposition: attachment`; в браузере это обычное скачивание Markdown-файла.

## Проверка

```powershell
npm install
npm run check
npx wrangler d1 migrations apply advent-day-19-weather-advice --remote
npm run deploy
```

`npm run check` запускает TypeScript и три теста: выбор завтрашней даты в таймзоне города, правила саммари и полный MCP-пайплайн с доказательством порядка вызовов и передачи готового Markdown в третий инструмент.

Для локального запуска:

```powershell
npx wrangler d1 migrations apply advent-day-19-weather-advice --local
npm run dev
```

После запуска откройте URL, выведенный Wrangler. Для локального режима Worker использует локальную D1-базу.

## HTTP-маршруты

- `GET /` — интерфейс запроса.
- `POST /api/advice` с телом `{"city":"Belgrade"}` — запускает полный пайплайн.
- `GET /files/<id>.md` — скачивает сохранённый файл.
- `GET|POST|DELETE /mcp` — стандартный Streamable HTTP MCP endpoint.
- `GET /health` — проверка Worker.
