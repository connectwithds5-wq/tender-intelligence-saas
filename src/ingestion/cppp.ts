import { TenderSchema, type Tender } from "../domain/tender.js";

// CPPP exposes the same public latest-tenders data through a few public routes.
// Some runners receive intermittent 5xx responses from one hostname/route, so
// try the public mirrors/routes in sequence. No CAPTCHA/authentication bypass.
export const CPPP_EPROCURE_URL = "https://www.eprocure.gov.in/eprocure/app";
const CPPP_ENDPOINTS = [
  "https://www.eprocure.gov.in/eprocure/app",
  "https://www.eprocure.gov.in/eprocure/app?page=Front",
  "https://www.eprocure.gov.in/eprocure/app?page=Frontend",
  "https://eprocure.gov.in/eprocure/app?page=Front",
  "https://eprocure.gov.in/eprocure/app?page=Frontend",
  "https://www.eprocure.gov.in/epublish/app?service=home",
  "https://eprocure.gov.in/epublish/app?service=home",
] as const;

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

function parseLatestTenders(html: string, sourceUrl: string): Tender[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripHtml(cell[1])))
    .filter((cells) => cells.length >= 3);

  const tenders: Tender[] = [];
  for (const cells of rows) {
    const rowText = cells.join(" | ");
    if (/tender title|latest tenders|corrigendum title/i.test(rowText)) continue;

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
      sourceUrl,
      closingAt,
      raw: { source: "cppp-public", bidOpeningAt: bidOpening, fetchedAt: new Date().toISOString() },
      keywords: [],
    }));
  }

  return [...new Map(tenders.map((t) => [t.id, t])).values()];
}

export async function fetchCpppTenders(): Promise<Tender[]> {
  const errors: string[] = [];

  for (const url of CPPP_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "TenderIntelligenceSaaS/0.1 (+public-tender-indexer)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`);
        continue;
      }
      const html = await response.text();
      const tenders = parseLatestTenders(html, url);
      if (tenders.length > 0) return tenders;
      errors.push(`${url}: no parseable latest-tender rows`);
    } catch (error) {
      errors.push(`${url}: ${String(error)}`);
    }
  }

  throw new Error(`CPPP public feed unavailable across ${CPPP_ENDPOINTS.length} endpoints: ${errors.join(" | ")}`);
}
