import type { BusinessProfile } from "../domain/tender.js";
import { getSupabase } from "./supabase.js";

function fromRow(row: any): BusinessProfile {
  return {
    id: row.id,
    businessName: row.business_name,
    categories: row.categories ?? [],
    locations: row.locations ?? [],
    keywords: row.keywords ?? [],
    minTenderValue: row.min_tender_value == null ? undefined : Number(row.min_tender_value),
    maxTenderValue: row.max_tender_value == null ? undefined : Number(row.max_tender_value),
    annualTurnover: row.annual_turnover == null ? undefined : Number(row.annual_turnover),
    certifications: row.certifications ?? [],
    experienceKeywords: row.experience_keywords ?? [],
  };
}

export async function createBusinessProfile(profile: BusinessProfile, userId: string): Promise<BusinessProfile> {
  const db = getSupabase();
  if (!db) return profile;
  const { error } = await db.from("business_profiles").insert({
    id: profile.id,
    user_id: userId,
    business_name: profile.businessName,
    categories: profile.categories,
    locations: profile.locations,
    keywords: profile.keywords,
    min_tender_value: profile.minTenderValue,
    max_tender_value: profile.maxTenderValue,
    annual_turnover: profile.annualTurnover,
    certifications: profile.certifications,
    experience_keywords: profile.experienceKeywords,
  });
  if (error) throw error;
  return profile;
}

export async function getBusinessProfile(profileId: string, userId: string): Promise<BusinessProfile | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from("business_profiles").select("*").eq("id", profileId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function listBusinessProfiles(userId: string): Promise<BusinessProfile[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.from("business_profiles").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function deleteBusinessProfile(profileId: string, userId: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db.from("business_profiles").delete().eq("id", profileId).eq("user_id", userId);
  if (error) throw error;
}
