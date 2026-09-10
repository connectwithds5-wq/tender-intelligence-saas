import { TenderSchema, type Tender } from "../domain/tender.js";

// CPPP's public eProcurement landing page exposes a latest-tenders table.
// We consume only that public HTML and do not bypass CAPTCHA/authentication.
export const CPPP_EPROCURE_URL = "https://eprocure.gov.in/eprocure/app";

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/&nbsp;/gi, " ").trim();
}

function stripHtml(value: string): string {
  return clean(value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " "));
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

function isDateCell(value: string): boolean {
  return /\d{1,2}[-\s]\w{3}[-\s]\d{4}\s+\d{1,2}:\d{2}/i.test(value);
}

function looksLikeReference(value: string): boolean {
  return value.length >= 4 && !/^\d+$/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function parseLatestTenders(html: string): Tender[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripHtml(cell[1])))
    .filter((cells) => cells.length >= 3);

  const tenders: Tender[] = [];
  for (const cells of rows) {
    const rowText = cells.join(" | ");
    if (/tender title|latest tenders|corrigendum title/i.test(rowText)) continue;

    // Current CPPP markup includes a serial-number cell before title/reference.
    // Find the date cells first, then infer reference/title around them instead
    // of relying on a brittle fixed column position.
    const closingIndex = cells.findIndex(isDateCell);
    if (closingIndex < 0) continue;
    const closingAt = parseDate(cells[closingIndex]);
    if (!closingAt) continue;

    const bidOpeningAt = cells.slice(closingIndex + 1).find(isDateCell);
    const bidOpening = bidOpeningAt ? parseDate(bidOpeningAt) : undefined;

    const beforeDates = cells.slice(0, closingIndex).filter(Boolean);
    const referenceIndex = beforeDates.findIndex(looksLikeReference);
    if (referenceIndex < 0) continue;

    const referenceNumber = beforeDates[referenceIndex];
    const titleCandidates = beforeDates
      .slice(0, referenceIndex)
      .filter((cell) => !/^\d+$/.test(cell) && !/^sr\.?\s*no/i.test(cell));
    const title = titleCandidates.at(-1) ?? "";
    if (!title || !referenceNumber) continue;

    tenders.push(TenderSchema.parse({
      id: `cppp:${referenceNumber}`,
      referenceNumber,
      title,
      source: "CPPP eProcurement",
      sourceUrl: CPPP_EPROCURE_URL,
      closingAt,
      raw: { source: "cppp-eprocure", bidOpeningAt: bidOpening, fetchedAt: new Date().toISOString() },
      keywords: [],
    }));
  }

  return [...new Map(tenders.map((t) => [t.id, t])).values()];
}

export async function fetchCpppTenders(): Promise<Tender[]> {
  const response = await fetch(CPPP_EPROCURE_URL, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "TenderIntelligenceSaaS/0.1 (+public-tender-indexer)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`CPPP returned HTTP ${response.status}`);
  const html = await response.text();
  const tenders = parseLatestTenders(html);
  if (tenders.length === 0) throw new Error("CPPP latest-tenders table contained no parseable tenders");
  return tenders;
}
