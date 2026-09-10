import { z } from "zod";

export const TenderSchema = z.object({
  id: z.string().min(1), referenceNumber: z.string().optional(), title: z.string().min(1),
  buyer: z.string().optional(), category: z.string().optional(), location: z.string().optional(),
  estimatedValue: z.number().nonnegative().optional(), emdAmount: z.number().nonnegative().optional(),
  publishedAt: z.string().datetime().optional(), closingAt: z.string().datetime().optional(),
  source: z.string().min(1), sourceUrl: z.string().url(), documentUrl: z.string().url().optional(),
  keywords: z.array(z.string()).default([]), description: z.string().optional(), raw: z.record(z.unknown()).default({})
});
export type Tender = z.infer<typeof TenderSchema>;

export const BusinessProfileSchema = z.object({
  id: z.string().uuid(), businessName: z.string().min(1), categories: z.array(z.string()).min(1),
  locations: z.array(z.string()).default([]), keywords: z.array(z.string()).default([]),
  minTenderValue: z.number().nonnegative().optional(), maxTenderValue: z.number().nonnegative().optional(),
  annualTurnover: z.number().nonnegative().optional(), certifications: z.array(z.string()).default([]),
  experienceKeywords: z.array(z.string()).default([])
});
export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;
export const BusinessProfileInputSchema = BusinessProfileSchema.omit({ id: true });
export type BusinessProfileInput = z.infer<typeof BusinessProfileInputSchema>;

export type MatchReason = { factor: string; score: number; detail: string };
export type TenderMatch = { tenderId: string; score: number; recommendation: "BID" | "REVIEW" | "SKIP"; reasons: MatchReason[] };
