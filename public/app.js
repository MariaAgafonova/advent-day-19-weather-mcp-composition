const form = document.querySelector("#weather-form");
const cityInput = document.querySelector("#city");
const submitButton = document.querySelector("#submit");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  if (city.length < 2) return;
  setLoading(true, "Агент запускает цепочку MCP-инструментов…");
  result.hidden = true;
  try {
    const response = await fetch("/api/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Не удалось выполнить запрос.");
    render(payload);
    setLoading(false, "Готово: три MCP-инструмента выполнены последовательно.", "success");
  } catch (error) {
    setLoading(false, error instanceof Error ? error.message : String(error), "error");
  }
});

function render(payload) {
  const { forecast, advice, file, steps } = payload;
  document.querySelector("#date").textContent = "Прогноз на " + forecast.date + " · " + forecast.timezone;
  document.querySelector("#city-name").textContent = [forecast.city, forecast.admin1, forecast.country].filter(Boolean).join(", ");
  document.querySelector("#summary").textContent = advice.summary;
  const metrics = [
    ["Температура", forecast.temperatureMinC + "…" + forecast.temperatureMaxC + " °C"],
    ["Осадки", "до " + forecast.precipitationProbabilityMax + "%"],
    ["Ветер", "до " + forecast.windSpeedMaxKmh + " км/ч"],
  ];
  document.querySelector("#metrics").replaceChildren(...metrics.map(([label, value]) => metric(label, value)));
  document.querySelector("#clothing").replaceChildren(...advice.clothing.map((item) => {
    const element = document.createElement("li");
    element.textContent = item;
    return element;
  }));
  document.querySelector("#umbrella").textContent = (advice.umbrella.shouldTake ? "Взять. " : "Можно не брать. ") + advice.umbrella.reason;
  document.querySelector("#pipeline").replaceChildren(...steps.map((step) => {
    const element = document.createElement("li");
    element.textContent = toolLabel(step.tool) + " — выполнен";
    return element;
  }));
  const link = document.querySelector("#file-link");
  link.href = file.url;
  link.textContent = "Открыть Markdown-файл (" + file.bytes + " байт)";
  result.hidden = false;
}

function metric(label, value) {
  const element = document.createElement("div");
  element.className = "metric";
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  element.append(labelElement, valueElement);
  return element;
}

function toolLabel(name) {
  return { search_weather: "1. search_weather", summarize_weather: "2. summarize_weather", save_to_file: "3. save_to_file" }[name] || name;
}

function setLoading(isLoading, message, kind = "loading") {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Выполняется…" : "Получить совет";
  status.hidden = false;
  status.className = "status " + kind;
  status.textContent = message;
}
