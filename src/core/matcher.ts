import type { BusinessProfile, Tender, TenderMatch, MatchReason } from "../domain/tender.js";

const normalize = (value: string) => value.trim().toLowerCase();
const includesAny = (haystack: string, needles: string[]) => needles.some((n) => haystack.includes(normalize(n)));

export function matchTender(tender: Tender, profile: BusinessProfile): TenderMatch {
  const reasons: MatchReason[] = [];
  const text = [tender.title, tender.category, tender.description, ...tender.keywords]
    .filter(Boolean)
    .join(" ");

  if (profile.categories.length && includesAny(text, profile.categories)) {
    reasons.push({ factor: "category", score: 30, detail: "Tender scope matches a business category." });
  }

  if (profile.keywords.length && includesAny(text, profile.keywords)) {
    reasons.push({ factor: "keywords", score: 20, detail: "Tender contains relevant business keywords." });
  }

  if (profile.locations.length && tender.location && includesAny(tender.location, profile.locations)) {
    reasons.push({ factor: "location", score: 15, detail: "Tender location matches a preferred operating area." });
  }

  if (tender.estimatedValue !== undefined) {
    const minOk = profile.minTenderValue === undefined || tender.estimatedValue >= profile.minTenderValue;
    const maxOk = profile.maxTenderValue === undefined || tender.estimatedValue <= profile.maxTenderValue;
    if (minOk && maxOk) {
      reasons.push({ factor: "value", score: 15, detail: "Estimated tender value is within the preferred range." });
    }
  }

  if (profile.experienceKeywords.length && includesAny(text, profile.experienceKeywords)) {
    reasons.push({ factor: "experience", score: 10, detail: "Tender scope appears aligned with stated experience." });
  }

  const score = Math.min(100, reasons.reduce((sum, reason) => sum + reason.score, 0));
  const recommendation = score >= 75 ? "BID" : score >= 45 ? "REVIEW" : "SKIP";

  return { tenderId: tender.id, score, recommendation, reasons };
}
