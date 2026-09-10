import { z } from "zod";

export const EvidenceSchema = z.object({
  requirement: z.string(),
  value: z.string(),
  page: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1),
});

export const TenderDocumentAnalysisSchema = z.object({
  eligibility: z.object({
    turnover: z.string().optional(),
    experience: z.string().optional(),
    certifications: z.array(z.string()).default([]),
    emd: z.string().optional(),
    deadline: z.string().optional(),
  }),
  evidence: z.array(EvidenceSchema).default([]),
  warnings: z.array(z.string()).default([]),
  disclaimer: z.string(),
});

export type TenderDocumentAnalysis = z.infer<typeof TenderDocumentAnalysisSchema>;

/**
 * Deterministic extraction from text already obtained from a tender document.
 * It deliberately does not claim official/legal eligibility. An LLM adapter can
 * be layered over this normalized contract later while retaining evidence.
 */
export function analyzeTenderText(text: string): TenderDocumentAnalysis {
  const normalized = text.replace(/\s+/g, " ").trim();
  const evidence: z.infer<typeof EvidenceSchema>[] = [];
  const warnings: string[] = [];
  const find = (label: string, pattern: RegExp) => {
    const match = normalized.match(pattern);
    if (!match) return undefined;
    const value = match[0].slice(0, 500);
    evidence.push({ requirement: label, value, confidence: 0.72 });
    return value;
  };

  const turnover = find("Turnover", /(?:average\s+annual|annual)\s+turnover[^.]{0,250}/i);
  const experience = find("Experience", /(?:similar|relevant)\s+(?:work|experience)[^.]{0,250}/i);
  const emd = find("EMD", /(?:earnest\s+money\s+deposit|EMD)[^.]{0,180}/i);
  const deadline = find("Deadline", /(?:bid|tender)\s+(?:submission|closing)[^.]{0,180}/i);

  const certifications = [...normalized.matchAll(/(?:ISO\s*\d{4,5}|GST|PAN|MSME|NSIC|Udyam)[^,.;]*/gi)]
    .map((m) => m[0].trim()).slice(0, 20);
  for (const certification of certifications) evidence.push({ requirement: "Certification", value: certification, confidence: 0.65 });

  if (!turnover && !experience && !emd && !deadline && certifications.length === 0) {
    warnings.push("No standard eligibility requirement was confidently extracted from the supplied text.");
  }

  return TenderDocumentAnalysisSchema.parse({
    eligibility: { turnover, experience, certifications, emd, deadline },
    evidence,
    warnings,
    disclaimer: "Document analysis is a pre-screening aid, not an official or legal eligibility determination. Verify every requirement against the original tender document.",
  });
}
