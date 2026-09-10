import type { Tender } from "../domain/tender.js";
import { TenderSchema } from "../domain/tender.js";

export type NicGePSource = {
  key: string;
  name: string;
  url: string;
  location: string;
};

export const NIC_GEP_SOURCES: NicGePSource[] = [
  { key: "maharashtra", name: "Maharashtra eProcurement", url: "https://mahatenders.gov.in/nicgep/app", location: "Maharashtra" },
  { key: "madhya-pradesh", name: "Madhya Pradesh eProcurement", url: "https://mpeproc.gov.in/", location: "Madhya Pradesh" },
  { key: "west-bengal", name: "West Bengal eTender", url: "https://etender.wb.nic.in/nicgep/app", location: "West Bengal" },
  { key: "kerala", name: "Kerala eTender", url: "https://etenders.kerala.gov.in/nicgep/app", location: "Kerala" },
  { key: "uttarakhand", name: "Uttarakhand eTender", url: "https://uktenders.gov.in/nicgep/app", location: "Uttarakhand" },
];

function clean(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
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

function absoluteUrl(base: string, href: string): string {
  try { return new URL(href, base).toString(); } catch { return base; }
}

function extractRows(html: string): string[] {
  return html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
}

function parseSource(source: NicGePSource, html: string): Tender[] {
  const tenders: Tender[] = [];
  for (const row of extractRows(html)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => clean(m[1]));
    if (cells.length < 2) continue;
    if (cells.some((cell) => /tender title|reference no|closing date/i.test(cell))) continue;

    const refIndex = cells.findIndex((cell) => /[A-Z0-9][A-Z0-9./()_-]{4,}/i.test(cell) && cell.length < 180);
    const referenceNumber = refIndex >= 0 ? cells[refIndex] : undefined;
    const title = cells.find((cell, index) => index !== refIndex && cell.length >= 12 && !/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(cell));
    if (!referenceNumber || !title) continue;

    const dates = [...row.matchAll(/\d{1,2}[-/]\d{1,2}[-/]\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/gi)].map((m) => m[0]);
    const closingAt = parseDate(dates[0] ?? "");
    const links = [...row.matchAll(/href=["']([^"']+)["']/gi)].map((m) => absoluteUrl(source.url, m[1]));
    const sourceUrl = links.find((url) => /tender|nicgep|nit|details/i.test(url)) ?? source.url;
    const id = `nicgep:${source.key}:${referenceNumber}`;

    try {
      tenders.push(TenderSchema.parse({
        id,
        referenceNumber: referenceNumber.slice(0, 300),
        title: title.slice(0, 500),
        location: source.location,
        closingAt,
        source: source.name,
        sourceUrl,
        keywords: title.toLowerCase().split(/[^a-z0-9]+/i).filter((word) => word.length > 2).slice(0, 40),
        description: title.slice(0, 2000),
        raw: { portal: source.key, listingUrl: source.url },
      }));
    } catch {
      // Ignore navigation/header rows that do not satisfy the common tender schema.
    }
  }
  return [...new Map(tenders.map((tender) => [tender.id, tender])).values()];
}

export async function fetchNicGePTenders(source: NicGePSource): Promise<Tender[]> {
  const response = await fetch(source.url, {
    headers: { accept: "text/html", "user-agent": "TenderIntelligenceSaaS/1.0 (+public-tender-indexer)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}`);
  const tenders = parseSource(source, await response.text());
  if (tenders.length === 0) throw new Error(`${source.name} returned no parseable public tenders; portal markup may have changed.`);
  return tenders;
}

export async function fetchAllNicGePTenders(): Promise<{ tenders: Tender[]; errors: string[]; counts: Record<string, number> }> {
  const results = await Promise.allSettled(NIC_GEP_SOURCES.map(fetchNicGePTenders));
  const tenders = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const errors = results.map((result, index) => result.status === "rejected" ? `${NIC_GEP_SOURCES[index].name}: ${String(result.reason)}` : undefined).filter(Boolean) as string[];
  const counts: Record<string, number> = {};
  for (const tender of tenders) counts[tender.source] = (counts[tender.source] ?? 0) + 1;
  return { tenders, errors, counts };
}
