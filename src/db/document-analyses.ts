import type { TenderDocumentAnalysis } from "../core/document-analysis.js";
import { getSupabase } from "./supabase.js";

export type SavedDocumentAnalysis = {
  id: string;
  tenderId: string;
  userId: string;
  documentUrl: string;
  status: "analyzed" | "failed";
  extractedText: string;
  analysis: TenderDocumentAnalysis;
  createdAt: string;
  updatedAt: string;
};

function fromRow(row: any): SavedDocumentAnalysis {
  return {
    id: row.id,
    tenderId: row.tender_id,
    userId: row.user_id,
    documentUrl: row.document_url,
    status: row.status,
    extractedText: row.extracted_text ?? "",
    analysis: row.analysis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveDocumentAnalysis(input: Omit<SavedDocumentAnalysis, "id" | "createdAt" | "updatedAt">) {
  const db = getSupabase();
  if (!db) {
    return { ...input, id: `memory:${input.tenderId}:${input.userId}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }
  const { data, error } = await db.from("tender_document_analyses").upsert({
    tender_id: input.tenderId,
    user_id: input.userId,
    document_url: input.documentUrl,
    status: input.status,
    extracted_text: input.extractedText,
    analysis: input.analysis,
    updated_at: new Date().toISOString(),
  }, { onConflict: "tender_id,user_id" }).select("*").single();
  if (error) throw error;
  return fromRow(data);
}

export async function getDocumentAnalysis(tenderId: string, userId: string) {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from("tender_document_analyses").select("*").eq("tender_id", tenderId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}
