import type { BusinessProfile, Tender } from "../domain/tender.js";

export type EligibilityFinding = {
  status: "PASS" | "WARNING" | "UNKNOWN";
  factor: string;
  detail: string;
};

export type EligibilityAnalysis = {
  recommendation: "BID" | "REVIEW" | "SKIP";
  confidence: number;
  findings: EligibilityFinding[];
};

/** Deterministic pre-screen used before optional LLM analysis. */
export function analyzeEligibility(tender: Tender, profile: BusinessProfile): EligibilityAnalysis {
  const text = [tender.title, tender.description, tender.category, ...tender.keywords].filter(Boolean).join(" ").toLowerCase();
  const findings: EligibilityFinding[] = [];

  if (profile.categories.some((c) => text.includes(c.toLowerCase()))) {
    findings.push({ status: "PASS", factor: "category", detail: "Tender scope contains a configured business category." });
  } else {
    findings.push({ status: "UNKNOWN", factor: "category", detail: "No configured category was found in the published metadata." });
  }

  if (tender.estimatedValue !== undefined && profile.annualTurnover !== undefined) {
    const ratio = tender.estimatedValue / Math.max(profile.annualTurnover, 1);
    findings.push(ratio <= 1 ? { status: "PASS", factor: "value-vs-turnover", detail: "Tender value is not greater than the configured annual turnover." } : { status: "WARNING", factor: "value-vs-turnover", detail: "Tender value exceeds configured annual turnover; verify financial eligibility." });
  } else {
    findings.push({ status: "UNKNOWN", factor: "financial", detail: "Turnover/value evidence is not available in the published metadata." });
  }

  if (tender.emdAmount !== undefined) {
    findings.push({ status: "WARNING", factor: "emd", detail: `EMD reported as ₹${tender.emdAmount.toLocaleString("en-IN")}; verify exemptions and payment requirements.` });
  }

  const warnings = findings.filter((f) => f.status === "WARNING").length;
  const passes = findings.filter((f) => f.status === "PASS").length;
  const confidence = Math.round(Math.min(100, 50 + passes * 15 - warnings * 10));
  const recommendation = warnings >= 2 ? "REVIEW" : passes >= 1 ? "BID" : "REVIEW";
  return { recommendation, confidence, findings };
}
