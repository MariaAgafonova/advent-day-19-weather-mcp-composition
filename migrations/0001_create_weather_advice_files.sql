CREATE TABLE IF NOT EXISTS weather_advice_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  city TEXT NOT NULL,
  forecast_date TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weather_advice_files_created_at
  ON weather_advice_files (created_at DESC);
