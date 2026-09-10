import type { Tender } from "../domain/tender.js";
import { getSupabase } from "./supabase.js";

const memory: Tender[] = [];

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

export function getMemoryTenders(): Tender[] { return [...memory]; }
