import type { Tender } from "../domain/tender.js";
import { getSupabase } from "./supabase.js";

const memory: Tender[] = [];

function fromRow(row: Record<string, unknown>): Tender {
  return {
    id: String(row.id),
    referenceNumber: row.reference_number ? String(row.reference_number) : undefined,
    title: String(row.title ?? "Untitled tender"),
    buyer: row.buyer ? String(row.buyer) : undefined,
    category: row.category ? String(row.category) : undefined,
    location: row.location ? String(row.location) : undefined,
    estimatedValue: typeof row.estimated_value === "number" ? row.estimated_value : undefined,
    emdAmount: typeof row.emd_amount === "number" ? row.emd_amount : undefined,
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    closingAt: row.closing_at ? String(row.closing_at) : undefined,
    source: String(row.source ?? "Unknown"),
    sourceUrl: String(row.source_url),
    documentUrl: row.document_url ? String(row.document_url) : undefined,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    description: row.description ? String(row.description) : undefined,
    raw: row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : {},
  };
}

export async function upsertTenders(tenders: Tender[]): Promise<number> {
  const db = getSupabase();
  if (!db) {
    const map = new Map(memory.map((t) => [t.id, t]));
    for (const tender of tenders) map.set(tender.id, tender);
    memory.splice(0, memory.length, ...map.values());
    return tenders.length;
  }
  const rows = tenders.map((t) => ({
    id: t.id, reference_number: t.referenceNumber, title: t.title, buyer: t.buyer,
    category: t.category, location: t.location, estimated_value: t.estimatedValue,
    emd_amount: t.emdAmount, published_at: t.publishedAt, closing_at: t.closingAt,
    source: t.source, source_url: t.sourceUrl, document_url: t.documentUrl,
    keywords: t.keywords, description: t.description, raw: t.raw, last_seen_at: new Date().toISOString(),
  }));
  const { error } = await db.from("tenders").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return rows.length;
}

export async function getStoredTenders(limit = 500): Promise<Tender[]> {
  const db = getSupabase();
  if (!db) return [...memory].slice(0, limit);
  const { data, error } = await db
    .from("tenders")
    .select("id,reference_number,title,buyer,category,location,estimated_value,emd_amount,published_at,closing_at,source,source_url,document_url,keywords,description,raw")
    .order("closing_at", { ascending: true, nullsFirst: false })
    .limit(Math.min(Math.max(limit, 1), 1000));
  if (error) throw error;
  return (data ?? []).map((row) => fromRow(row as Record<string, unknown>));
}

export function getMemoryTenders(): Tender[] { return [...memory]; }
