import { TenderSchema, type Tender } from "../domain/tender.js";

export async function fetchGenericJsonFeed(url: string): Promise<Tender[]> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Tender feed returned HTTP ${response.status}`);

  const payload: unknown = await response.json();
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "tenders" in payload && Array.isArray((payload as { tenders: unknown }).tenders)
      ? (payload as { tenders: unknown[] }).tenders
      : null;

  if (!rows) throw new Error("Tender feed must be an array or an object with a tenders array");
  return rows.map((row, index) => TenderSchema.parse({ ...(row as object), id: String((row as any).id ?? `feed-${index}`) }));
}

export async function fetchConfiguredFeed(): Promise<Tender[]> {
  const url = process.env.TENDER_FEED_URL;
  if (!url) return [];
  return fetchGenericJsonFeed(url);
}
