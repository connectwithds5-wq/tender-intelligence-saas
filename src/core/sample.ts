import type { BusinessProfile, Tender } from "../domain/tender.js";

export const sampleProfile: BusinessProfile = {
  id: "demo-company",
  businessName: "Demo Solar EPC",
  categories: ["solar", "epc"],
  locations: ["gujarat", "rajasthan"],
  keywords: ["rooftop", "solar plant", "photovoltaic"],
  minTenderValue: 1_000_000,
  maxTenderValue: 100_000_000,
  annualTurnover: 50_000_000,
  certifications: [],
  experienceKeywords: ["solar", "electrical"]
};

export const sampleTender: Tender = {
  id: "demo-001",
  referenceNumber: "DEMO/2026/001",
  title: "Design, Supply and Installation of Rooftop Solar PV System",
  buyer: "Demo Government Department",
  category: "Solar EPC",
  location: "Ahmedabad, Gujarat",
  estimatedValue: 12_500_000,
  emdAmount: 250_000,
  publishedAt: "2026-09-10T08:00:00Z",
  closingAt: "2026-09-20T12:00:00Z",
  source: "demo",
  sourceUrl: "https://example.com/tender/demo-001",
  keywords: ["solar", "rooftop", "EPC", "photovoltaic"],
  description: "Supply, installation and commissioning of rooftop solar PV systems.",
  raw: {}
};
