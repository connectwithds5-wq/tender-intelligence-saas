import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.DASHBOARD_ORIGIN || "https://connectwithds5-wq.github.io");
  res.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}
function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend Supabase configuration is missing");
  return createClient(url, key, { auth: { persistSession: false } });
}
async function stripe(path, params) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) body.set(key, String(value));
  const response = await fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Stripe request failed");
  return data;
}
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
    const client = db();
    const { data, error } = await client.auth.getUser(auth.slice(7).trim());
    if (error || !data.user) return res.status(401).json({ error: "Invalid session" });
    const { data: row } = await client.from("subscriptions").select("stripe_customer_id").eq("user_id", data.user.id).maybeSingle();
    if (!row?.stripe_customer_id) return res.status(400).json({ error: "No Stripe customer exists for this account yet." });
    const origin = process.env.DASHBOARD_ORIGIN || "https://connectwithds5-wq.github.io/tender-intelligence-saas";
    const session = await stripe("billing_portal/sessions", { customer: row.stripe_customer_id, return_url: origin });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to open billing portal" });
  }
}
