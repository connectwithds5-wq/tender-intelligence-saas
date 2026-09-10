import type { Tender } from "../domain/tender.js";

const GEM_BASE_URL = "https://bidplus.gem.gov.in";
const GEM_LIST_URL = `${GEM_BASE_URL}/all-bids`;
const REQUEST_TIMEOUT_MS = 30_000;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (!match) return undefined;
  const [, dd, mm, yyyy, hh = "00", min = "00", sec = "00", meridiem] = match;
  let hour = Number(hh);
  if (meridiem?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (meridiem?.toUpperCase() === "AM" && hour === 12) hour = 0;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min), Number(sec)));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function absoluteUrl(value: string): string {
  if (value.startsWith("http")) return value;
  return `${GEM_BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

function extractBidNumber(text: string): string | undefined {
  return text.match(/GEM\/\d{4}\/B\/\d+/i)?.[0].toUpperCase();
}

function extractDate(text: string, label: string): string | undefined {
  const pattern = new RegExp(`${label}[^\\d]{0,80}(\\d{2}[-/]\\d{2}[-/]\\d{4}[^<]{0,30})`, "i");
  return toIso(text.match(pattern)?.[1]);
}

function extractRows(html: string): Tender[] {
  const tenders: Tender[] = [];
  const rowMatches = html.match(/<tr[\\s\\S]*?<\\/tr>/gi) ?? [];

  for (const row of rowMatches) {
    const text = decodeHtml(row);
    const referenceNumber = extractBidNumber(text);
    if (!referenceNumber) continue;

    const links = [...row.matchAll(/href=["']([^"']*(?:showbidDocument|bidding)[^"']*)["']/gi)].map((m) => absoluteUrl(m[1]));
    const sourceUrl = links.find((url) => /showbidDocument|bidding/i.test(url)) ?? `${GEM_BASE_URL}/all-bids`;

    const cells = [...row.matchAll(/<td[^>]*>([\\s\\S]*?)<\\/td>/gi)].map((m) => decodeHtml(m[1]));
    const description = cells.find((cell) => !/GEM\/\d{4}\/B\/\d+/i.test(cell) && cell.length > 15) ?? text;
    const dates = [...text.matchAll(/\d{2}[-/]\d{2}[-/]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?/gi)].map((m) => m[0]);

    const publishedAt = toIso(dates[0]);
    const closingAt = toIso(dates[1] ?? dates[0]);
    const category = cells.find((cell) => /category|service|product/i.test(cell)) ?? undefined;

    tenders.push({
      id: `gem:${referenceNumber}`,
      referenceNumber,
      title: description.slice(0, 500),
      category: category?.slice(0, 250),
      publishedAt,
      closingAt,
      source: "GeM",
      sourceUrl,
      keywords: description.toLowerCase().split(/[^a-z0-9]+/i).filter((x) => x.length > 2).slice(0, 40),
      description: description.slice(0, 2000),
      raw: { portal: "GeM", listingUrl: GEM_LIST_URL },
    });
  }

  const unique = new Map<string, Tender>();
  for (const tender of tenders) unique.set(tender.id, tender);
  return [...unique.values()];
}

export async function fetchGemTenders(): Promise<Tender[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(GEM_LIST_URL, {
      headers: { "user-agent": "TenderIntelligence/1.0 (+public-tender-ingestion)" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GeM returned HTTP ${response.status}`);
    const html = await response.text();
    const tenders = extractRows(html);
    if (tenders.length === 0) throw new Error("GeM page returned no parseable public bids; portal markup may have changed.");
    return tenders;
  } finally {
    clearTimeout(timeout);
  }
}
