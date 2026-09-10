import { TenderSchema, type Tender } from "../domain/tender.js";

// CPPP exposes a public Central Active Tenders listing under /cppp that is
// reachable independently of the CAPTCHA-protected eProcure search pages.
// We use only public listing pages; no CAPTCHA/authentication bypass.
export const CPPP_EPROCURE_URL = "https://www.eprocure.gov.in/cppp/latestactivetendersnew/cpppdata";
const CPPP_BASE = "https://eprocure.gov.in/cppp/latestactivetendersnew/cpppdata";
const CPPP_ENDPOINTS = [
  CPPP_BASE,
  "https://eprocure.gov.in/cppp/latestactivetendersnew",
  "https://www.eprocure.gov.in/eprocure/app",
  "https://www.eprocure.gov.in/epublish/app?service=home",
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

function parseTitleAndReference(value: string): { title: string; referenceNumber: string } | undefined {
  const normalized = clean(value);
  const parts = normalized.split(/\s+\/\s+/).map(clean).filter(Boolean);
  if (parts.length >= 2) {
    const referenceNumber = parts.at(-1)!;
    const title = parts.slice(0, -1).join(" / ").trim();
    if (referenceNumber.length >= 4 && /[A-Za-z]/.test(referenceNumber) && /\d/.test(referenceNumber)) {
      return { title: title || referenceNumber, referenceNumber };
    }
  }
  if (normalized.length >= 4 && /[A-Za-z]/.test(normalized) && /\d/.test(normalized)) {
    return { title: normalized, referenceNumber: normalized };
  }
  return undefined;
}

function parseLatestTenders(html: string, sourceUrl: string): Tender[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => ({
      raw: m[1],
      cells: [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripHtml(cell[1])),
    }))
    .filter(({ cells }) => cells.length >= 3);

  const tenders: Tender[] = [];
  for (const { raw, cells } of rows) {
    const rowText = cells.join(" | ");
    if (/tender title|latest tenders|corrigendum title|sl\.no/i.test(rowText)) continue;

    const dateIndexes = cells.map((cell, index) => isDateCell(cell) ? index : -1).filter((index) => index >= 0);
    if (dateIndexes.length < 2) continue;

    // The new public CPPP table is: Sl.No | published | closing | opening | title/ref/id | org | corrigendum.
    const isNewPublicTable = dateIndexes.length >= 3;
    const closingIndex = isNewPublicTable ? dateIndexes[1] : dateIndexes[0];
    const openingIndex = isNewPublicTable ? dateIndexes[2] : dateIndexes[1];
    const closingAt = parseDate(cells[closingIndex]);
    const bidOpening = parseDate(cells[openingIndex]);
    if (!closingAt) continue;

    let titleAndReference: { title: string; referenceNumber: string } | undefined;
    let detailUrl = sourceUrl;

    if (isNewPublicTable) {
      const tenderCell = cells[closingIndex + 2] ?? "";
      titleAndReference = parseTitleAndReference(tenderCell);
      const href = raw.match(/<a[^>]+href=["']([^"']*tendersfullview[^"']*)["']/i)?.[1];
      if (href) detailUrl = new URL(href, sourceUrl).toString();
    } else {
      const beforeDates = cells.slice(0, closingIndex).filter(Boolean);
      const referenceIndex = beforeDates.findIndex((cell) => cell.length >= 4 && /[A-Za-z]/.test(cell) && /\d/.test(cell));
      if (referenceIndex >= 0) {
        const referenceNumber = beforeDates[referenceIndex];
        const titleCandidates = beforeDates.slice(0, referenceIndex).filter((cell) => !/^\d+$/.test(cell) && !/^sr\.?\s*no/i.test(cell));
        const title = titleCandidates.at(-1) ?? referenceNumber;
        titleAndReference = { title, referenceNumber };
      }
    }

    if (!titleAndReference) continue;
    const { title, referenceNumber } = titleAndReference;

    tenders.push(TenderSchema.parse({
      id: `cppp:${referenceNumber}`,
      referenceNumber,
      title,
      buyer: isNewPublicTable ? cells[openingIndex + 1] : undefined,
      source: "CPPP eProcurement",
      sourceUrl: detailUrl,
      closingAt,
      raw: { source: "cppp-public", bidOpeningAt: bidOpening, fetchedAt: new Date().toISOString() },
      keywords: [],
    }));
  }

  return [...new Map(tenders.map((t) => [t.id, t])).values()];
}

function pageUrl(page: number): string {
  if (page <= 1) return CPPP_BASE;
  // CPPP's public pagination encodes the target URL in its `url` parameter.
  const target = `${CPPP_BASE}?page=${page}`;
  return `${CPPP_BASE}?url=${Buffer.from(target, "utf8").toString("base64")}`;
}

async function fetchOne(url: string): Promise<Tender[]> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "TenderIntelligenceSaaS/0.1 (+public-tender-indexer)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseLatestTenders(await response.text(), url);
}

export async function fetchCpppTenders(): Promise<Tender[]> {
  const errors: string[] = [];

  // Prefer the current public CPPP listing and fetch several pages. This avoids
  // the CAPTCHA-protected search form while giving the matcher a useful feed.
  try {
    const pages = await Promise.all(
      Array.from({ length: 10 }, (_, index) => fetchOne(pageUrl(index + 1)).catch((error) => {
        errors.push(`CPPP page ${index + 1}: ${String(error)}`);
        return [] as Tender[];
      })),
    );
    const tenders = [...new Map(pages.flat().map((tender) => [tender.id, tender])).values()];
    if (tenders.length > 0) return tenders;
  } catch (error) {
    errors.push(`CPPP public listing: ${String(error)}`);
  }

  for (const url of CPPP_ENDPOINTS.slice(1)) {
    try {
      const tenders = await fetchOne(url);
      if (tenders.length > 0) return tenders;
      errors.push(`${url}: no parseable tender rows`);
    } catch (error) {
      errors.push(`${url}: ${String(error)}`);
    }
  }

  throw new Error(`CPPP public feed unavailable: ${errors.join(" | ")}`);
}
