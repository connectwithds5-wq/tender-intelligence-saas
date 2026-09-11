import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.DASHBOARD_ORIGIN || "https://connectwithds5-wq.github.io");
  res.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
}

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend billing configuration is missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function userFromRequest(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const client = db();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function ensureSubscription(client, userId) {
  const { data: existing } = await client.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (existing) return existing;
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const row = {
    user_id: userId,
    plan: "trial",
    status: "trialing",
    trial_started_at: now.toISOString(),
    trial_ends_at: end.toISOString()
  };
  const { data, error } = await client.from("subscriptions").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

function entitlement(row) {
  const now = Date.now();
  const trialEnds = row?.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
  const trialActive = row?.plan === "trial" && row?.status === "trialing" && trialEnds > now;
  const paidActive = ["active", "past_due"].includes(row?.status) && row?.plan !== "trial";
  return {
    allowed: trialActive || paidActive,
    state: trialActive ? "trial" : paidActive ? "active" : "expired",
    plan: row?.plan || "none",
    status: row?.status || "none",
    trialEndsAt: row?.trial_ends_at || null,
    currentPeriodEnd: row?.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end)
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET required" });
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const client = db();
    const row = await ensureSubscription(client, user.id);
    return res.status(200).json({ user: { id: user.id, email: user.email }, entitlement: entitlement(row) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load billing status" });
  }
}
