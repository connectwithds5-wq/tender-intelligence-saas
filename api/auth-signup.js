import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.DASHBOARD_ORIGIN || "https://connectwithds5-wq.github.io");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  try {
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon) throw new Error("Backend Supabase Auth configuration is missing");

    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const auth = createClient(url, anon, { auth: { persistSession: false } });
    const redirectTo = process.env.DASHBOARD_URL || "https://connectwithds5-wq.github.io/tender-intelligence-saas/";
    const { data, error } = await auth.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) return res.status(400).json({ error: error.message });

    if (data.user && service) {
      const admin = createClient(url, service, { auth: { persistSession: false } });
      const now = new Date();
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const { error: trialError } = await admin.from("subscriptions").upsert({
        user_id: data.user.id,
        plan: "trial",
        status: "trialing",
        trial_started_at: now.toISOString(),
        trial_ends_at: end.toISOString()
      }, { onConflict: "user_id" });
      if (trialError) console.error("Trial provisioning failed:", trialError.message);
    }

    return res.status(201).json({ user: data.user, session: data.session, trial: { hours: 24 } });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Sign-up failed" });
  }
}
