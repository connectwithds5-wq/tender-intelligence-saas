import { TenderSchema, type Tender } from "../domain/tender.js";

export const CPPP_E_PUBLISH_URL = "https://eprocure.gov.in/epublish/app?service=home";

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/&nbsp;/gi, " ").trim();
}

function stripHtml(value: string): string {
  return clean(value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
}

function parseDate(value: string): string | undefined {
  const match = value.match(/(\d{1,2})[-\s](\w{3})[-\s](\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return undefined;
  const [, day, month, year, hourRaw, minute, ampm] = match;
  const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const monthIndex = months[month.slice(0, 3).toLowerCase()];
  if (monthIndex === undefined) return undefined;
  let hour = Number(hourRaw);
  if (ampm?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (ampm?.toUpperCase() === "AM" && hour === 12) hour = 0;
  return new Date(Date.UTC(Number(year), monthIndex, Number(day), hour, Number(minute))).toISOString();
}

/**
 * Parses the public CPPP ePublishing latest-tenders table.
 * It intentionally consumes only public HTML and does not bypass authentication,
 * CAPTCHA, rate limits or other technical controls.
 */
export async function fetchCpppTenders(): Promise<Tender[]> {
  const response = await fetch(CPPP_E_PUBLISH_URL, {
    headers: { accept: "text/html", "user-agent": "TenderIntelligenceSaaS/0.1 (+public-tender-indexer)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`CPPP returned HTTP ${response.status}`);
  const html = await response.text();

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => m[1])
    .map((row) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripHtml(cell[1])))
    .filter((cells) => cells.length >= 3)
    .filter((cells) => !/tender title/i.test(cells[0]) && !/latest tenders/i.test(cells[0]));

  const tenders: Tender[] = [];
  for (const cells of rows) {
    const [title, referenceNumber, closingAt, bidOpeningAt] = cells;
    if (!title || !referenceNumber || !closingAt) continue;
    const closing = parseDate(closingAt);
    const bidOpening = parseDate(bidOpeningAt ?? "");
    const id = `cppp:${referenceNumber}`;
    tenders.push(TenderSchema.parse({
      id,
      referenceNumber,
      title,
      source: "CPPP ePublishing",
      sourceUrl: CPPP_E_PUBLISH_URL,
      closingAt: closing,
      raw: { source: "cppp-epublish", bidOpeningAt: bidOpening, fetchedAt: new Date().toISOString() },
      keywords: [],
    }));
  }
  return [...new Map(tenders.map((t) => [t.id, t])).values()];
}
