export interface SavedAdviceFile {
  id: string;
  filename: string;
  contentType: string;
  bytes: number;
}

export interface StoredAdviceFile extends SavedAdviceFile {
  content: string;
}

export async function saveAdviceFile(
  database: D1Database,
  input: { city: string; date: string; content: string },
): Promise<SavedAdviceFile> {
  const id = crypto.randomUUID();
  const slug = slugify(input.city) || "weather";
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : "undated";
  const filename = slug + "-" + safeDate + ".md";
  const contentType = "text/markdown; charset=utf-8";
  const bytes = new TextEncoder().encode(input.content).byteLength;
  await database.prepare(
    "INSERT INTO weather_advice_files (id, filename, city, forecast_date, content, content_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, filename, input.city, safeDate, input.content, contentType, bytes, new Date().toISOString()).run();
  return { id, filename, contentType, bytes };
}

export async function loadAdviceFile(database: D1Database, id: string): Promise<StoredAdviceFile | null> {
  return database.prepare(
    "SELECT id, filename, content_type AS contentType, bytes, content FROM weather_advice_files WHERE id = ?",
  ).bind(id).first<StoredAdviceFile>();
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
