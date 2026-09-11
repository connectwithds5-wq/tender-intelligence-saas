import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.DASHBOARD_ORIGIN || "https://connectwithds5-wq.github.io");
  res.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}
function db() { const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!url||!key)throw new Error("Backend Supabase configuration is missing"); return createClient(url,key,{auth:{persistSession:false}}); }
async function getUser(req) { const auth=req.headers.authorization||""; if(!auth.startsWith("Bearer "))return null; const {data,error}=await db().auth.getUser(auth.slice(7).trim()); return error||!data.user?null:data.user; }
async function stripe(path,params) { const secret=process.env.STRIPE_SECRET_KEY; if(!secret)throw new Error("STRIPE_SECRET_KEY is not configured"); const body=new URLSearchParams(); for(const [key,value] of Object.entries(params))body.set(key,String(value)); const response=await fetch("https://api.stripe.com/v1/"+path,{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/x-www-form-urlencoded"},body}); const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data?.error?.message||"Stripe request failed"); return data; }
export default async function handler(req,res){
  cors(res); if(req.method==="OPTIONS")return res.status(204).end(); if(req.method!=="POST")return res.status(405).json({error:"POST required"});
  try{
    const user=await getUser(req); if(!user)return res.status(401).json({error:"Authentication required"}); if(!process.env.STRIPE_PRICE_ID)return res.status(503).json({error:"Billing is not configured yet. Add STRIPE_PRICE_ID in Vercel."});
    const client=db(); const {data:existing}=await client.from("subscriptions").select("stripe_customer_id,plan,status").eq("user_id",user.id).maybeSingle(); let customerId=existing?.stripe_customer_id;
    if(!customerId){const customer=await stripe("customers",{email:user.email||"","metadata[user_id]":user.id});customerId=customer.id;await client.from("subscriptions").upsert({user_id:user.id,stripe_customer_id:customerId},{onConflict:"user_id"});}
    const dashboardUrl=process.env.DASHBOARD_URL||"https://connectwithds5-wq.github.io/tender-intelligence-saas";
    const session=await stripe("checkout/sessions",{mode:"subscription",customer:customerId,"line_items[0][price]":process.env.STRIPE_PRICE_ID,"line_items[0][quantity]":"1",success_url:dashboardUrl+"?billing=success",cancel_url:dashboardUrl+"?billing=cancelled","metadata[user_id]":user.id,"subscription_data[metadata][user_id]":user.id});
    return res.status(200).json({url:session.url,id:session.id});
  }catch(error){return res.status(500).json({error:error instanceof Error?error.message:"Unable to start checkout"});}
}
