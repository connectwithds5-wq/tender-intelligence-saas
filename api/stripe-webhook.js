import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend Supabase configuration is missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifySignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const signed = timestamp + "." + payload.toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isoFromUnix(value) {
  return Number.isFinite(Number(value)) ? new Date(Number(value) * 1000).toISOString() : null;
}

async function updateSubscription(event) {
  const client = db();
  const object = event.data?.object || {};
  const metadataUserId = object.metadata?.user_id || object.subscription_details?.metadata?.user_id || null;
  let userId = metadataUserId;
  if (!userId && object.customer) {
    const { data } = await client.from("subscriptions").select("user_id").eq("stripe_customer_id", object.customer).maybeSingle();
    userId = data?.user_id || null;
  }
  if (!userId) return { ignored: true, reason: "No matching user for Stripe event" };

  if (event.type === "checkout.session.completed") {
    const subscriptionId = object.subscription || null;
    await client.from("subscriptions").upsert({
      user_id: userId,
      stripe_customer_id: object.customer || null,
      stripe_subscription_id: subscriptionId,
      plan: "pro",
      status: "active",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    return { updated: true };
  }

  const statusMap = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    incomplete: "incomplete",
    incomplete_expired: "incomplete_expired",
    paused: "paused"
  };
  const status = statusMap[object.status] || "none";
  const row = {
    user_id: userId,
    stripe_customer_id: object.customer || null,
    stripe_subscription_id: object.id || null,
    plan: status === "active" || status === "past_due" || status === "trialing" ? "pro" : "pro",
    status,
    current_period_start: isoFromUnix(object.current_period_start),
    current_period_end: isoFromUnix(object.current_period_end),
    cancel_at_period_end: Boolean(object.cancel_at_period_end),
    updated_at: new Date().toISOString()
  };
  if (status === "canceled") row.plan = "pro";
  await client.from("subscriptions").upsert(row, { onConflict: "user_id" });
  return { updated: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  try {
    const payload = await rawBody(req);
    if (!verifySignature(payload, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).json({ error: "Invalid Stripe signature" });
    }
    const event = JSON.parse(payload.toString("utf8"));
    const handled = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
    if (!handled.includes(event.type)) return res.status(200).json({ received: true, ignored: true });
    const result = await updateSubscription(event);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Webhook processing failed" });
  }
}
