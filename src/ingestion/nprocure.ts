import type { Tender } from "../domain/tender.js";
import { TenderSchema } from "../domain/tender.js";

export const NPROCURE_URL = "https://tender.nprocure.com/";

function clean(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

function parseDate(value: string): string | undefined {
  const match = value.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return undefined;
  const [, day, month, year, hourRaw, minute, ampm] = match;
  let hour = Number(hourRaw);
  if (ampm?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (ampm?.toUpperCase() === "AM" && hour === 12) hour = 0;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hour, Number(minute)));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function fetchNprocureTenders(): Promise<Tender[]> {
  const response = await fetch(NPROCURE_URL, {
    headers: { accept: "text/html", "user-agent": "TenderIntelligenceSaaS/1.0 (+public-tender-indexer)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`nProcure returned HTTP ${response.status}`);
  const html = await response.text();
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const tenders: Tender[] = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => clean(m[1]));
    if (cells.length < 2 || cells.some((cell) => /tender id|tender title|closing date/i.test(cell))) continue;
    const referenceNumber = cells.find((cell) => /\b\d{4,8}\b/.test(cell) && cell.length < 100);
    const title = cells.find((cell) => cell.length >= 15 && cell !== referenceNumber);
    if (!referenceNumber || !title) continue;
    const dates = [...row.matchAll(/\d{1,2}[-/]\d{1,2}[-/]\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/gi)].map((m) => m[0]);
    const links = [...row.matchAll(/href=["']([^"']+)["']/gi)].map((m) => {
      try { return new URL(m[1], NPROCURE_URL).toString(); } catch { return NPROCURE_URL; }
    });
    try {
      tenders.push(TenderSchema.parse({
        id: `nprocure:${referenceNumber}`,
        referenceNumber: referenceNumber.slice(0, 200),
        title: title.slice(0, 500),
        location: "Gujarat",
        closingAt: parseDate(dates[0] ?? ""),
        source: "Gujarat nProcure",
        sourceUrl: links.find((url) => /nprocure|tender/i.test(url)) ?? NPROCURE_URL,
        keywords: title.toLowerCase().split(/[^a-z0-9]+/i).filter((word) => word.length > 2).slice(0, 40),
        description: title.slice(0, 2000),
        raw: { portal: "nprocure", listingUrl: NPROCURE_URL },
      }));
    } catch {
      // Ignore navigation rows that are not tender records.
    }
  }

  const unique = [...new Map(tenders.map((tender) => [tender.id, tender])).values()];
  if (unique.length === 0) throw new Error("nProcure returned no parseable public tenders; portal markup may have changed or require a different public listing route.");
  return unique;
}
