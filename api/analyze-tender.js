import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;
const ALLOWED_ORIGIN = process.env.DASHBOARD_ORIGIN || "https://connectwithds5-wq.github.io";
function cors(res) { res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN); res.setHeader("Access-Control-Allow-Headers", "content-type, authorization"); res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); res.setHeader("Cache-Control", "no-store"); }
function errorMessage(error) { return error instanceof Error ? error.message : "Tender document analysis failed"; }
function extractEvidence(text, label, pattern) { const match=text.match(pattern); return match ? { requirement:label, value:match[0].slice(0,500).trim(), confidence:0.72 } : undefined; }
function analyzeText(text) {
  const normalized=text.replace(/\s+/g," ").trim(); const evidence=[], warnings=[];
  const turnoverEvidence=extractEvidence(normalized,"Turnover",/(?:average\s+annual|annual)\s+turnover[^.]{0,250}/i); const experienceEvidence=extractEvidence(normalized,"Experience",/(?:similar|relevant)\s+(?:work|experience)[^.]{0,250}/i); const emdEvidence=extractEvidence(normalized,"EMD",/(?:earnest\s+money\s+deposit|EMD)[^.]{0,180}/i); const deadlineEvidence=extractEvidence(normalized,"Deadline",/(?:bid|tender)\s+(?:submission|closing)[^.]{0,180}/i);
  for(const item of [turnoverEvidence,experienceEvidence,emdEvidence,deadlineEvidence])if(item)evidence.push(item);
  const certifications=[...normalized.matchAll(/(?:ISO\s*\d{4,5}|GST|PAN|MSME|NSIC|Udyam)[^,.;]*/gi)].map((m)=>m[0].trim()).slice(0,20); for(const certification of certifications)evidence.push({requirement:"Certification",value:certification,confidence:0.65});
  if(!evidence.length)warnings.push("No standard eligibility requirement was confidently extracted from the supplied document text.");
  return { eligibility:{turnover:turnoverEvidence?.value,experience:experienceEvidence?.value,certifications,emd:emdEvidence?.value,deadline:deadlineEvidence?.value}, evidence, warnings, disclaimer:"Document analysis is a pre-screening aid, not an official or legal eligibility determination. Verify every requirement against the original tender document." };
}
async function fetchUrl(url) { const parsed=new URL(url); if(parsed.protocol!=="https:")throw new Error("Tender document URL must use HTTPS"); const host=parsed.hostname.toLowerCase(); if(["localhost","127.0.0.1","0.0.0.0","::1"].includes(host)||host.endsWith(".local"))throw new Error("Tender document URL is not allowed"); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),25_000); try{return await fetch(parsed,{signal:controller.signal,redirect:"follow",headers:{accept:"application/pdf,application/octet-stream,text/html;q=0.8"}});}finally{clearTimeout(timer);} }
async function resolveDocumentUrl(sourceUrl){ if(!sourceUrl)throw new Error("This tender has no public document/detail URL"); const response=await fetchUrl(sourceUrl); if(!response.ok)throw new Error(`Tender detail returned HTTP ${response.status}`); const type=response.headers.get("content-type")?.toLowerCase()||""; if(type.includes("pdf"))return response.url||sourceUrl; const html=await response.text(); const matches=[...html.matchAll(/(?:href|src)=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map((m)=>m[1]); const candidate=matches.find((href)=>!/javascript:|#/.test(href)); if(!candidate)throw new Error("No public PDF document link was found on the tender detail page"); return new URL(candidate,response.url||sourceUrl).toString(); }
async function downloadPdf(documentUrl){ const response=await fetchUrl(documentUrl); if(!response.ok)throw new Error(`Tender document returned HTTP ${response.status}`); const contentLength=Number(response.headers.get("content-length")||0); if(contentLength>MAX_PDF_BYTES)throw new Error("Tender PDF exceeds the 12MB analysis limit"); const bytes=Buffer.from(await response.arrayBuffer()); if(bytes.length>MAX_PDF_BYTES)throw new Error("Tender PDF exceeds the 12MB analysis limit"); if(bytes.subarray(0,5).toString("ascii")!=="%PDF-")throw new Error("Tender document is not a valid PDF"); return bytes; }
function getBearer(req){const value=req.headers.authorization||"";return value.startsWith("Bearer ")?value.slice(7).trim():"";}
async function entitlement(db,userId){
  let {data:row}=await db.from("subscriptions").select("plan,status,trial_ends_at,current_period_end").eq("user_id",userId).maybeSingle();
  if(!row){const now=new Date();const end=new Date(now.getTime()+24*60*60*1000);const created={user_id:userId,plan:"trial",status:"trialing",trial_started_at:now.toISOString(),trial_ends_at:end.toISOString()};const result=await db.from("subscriptions").insert(created).select("plan,status,trial_ends_at,current_period_end").single();if(result.error)throw result.error;row=result.data;}
  const trialActive=row.plan==="trial"&&row.status==="trialing"&&row.trial_ends_at&&new Date(row.trial_ends_at).getTime()>Date.now();
  const paidActive=["active","past_due"].includes(row.status)&&row.plan!=="trial";
  return {allowed:Boolean(trialActive||paidActive),state:trialActive?"trial":paidActive?"active":"expired",trialEndsAt:row.trial_ends_at||null,currentPeriodEnd:row.current_period_end||null};
}
async function recordUsage(db,userId){const period=new Date().toISOString().slice(0,10);const {data:row}=await db.from("usage").select("analyses").eq("user_id",userId).eq("period_start",period).maybeSingle();const next=(row?.analyses||0)+1;await db.from("usage").upsert({user_id:userId,period_start:period,analyses:next,updated_at:new Date().toISOString()},{onConflict:"user_id,period_start"});}

export default async function handler(req,res){
  cors(res); if(req.method==="OPTIONS")return res.status(204).end(); if(req.method!=="POST")return res.status(405).json({error:"POST required"});
  try{
    const token=getBearer(req); if(!token)return res.status(401).json({error:"Login required"});
    const supabaseUrl=process.env.SUPABASE_URL, serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!supabaseUrl||!serviceKey)throw new Error("Backend Supabase configuration is missing");
    const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}}); const {data:auth,error:authError}=await db.auth.getUser(token); if(authError||!auth.user)return res.status(401).json({error:"Invalid or expired session"});
    const access=await entitlement(db,auth.user.id); if(!access.allowed)return res.status(402).json({error:"Your 24-hour free trial has ended. Upgrade to continue using document intelligence.",code:"TRIAL_EXPIRED",entitlement:access});
    const input=req.body||{}; const documentUrl=input.documentUrl||await resolveDocumentUrl(input.sourceUrl); const pdf=await downloadPdf(documentUrl); const parser=new PDFParse({data:pdf}); let parsed; try{parsed=await parser.getText();}finally{await parser.destroy();}
    const text=String(parsed?.text||"").replace(/\u0000/g,"").trim(); if(!text)return res.status(422).json({error:"No selectable text found in this PDF. This appears to be a scanned/image-only document; OCR is required."});
    const extractedText=text.length>MAX_TEXT_CHARS?text.slice(0,MAX_TEXT_CHARS):text; const analysis=analyzeText(extractedText);
    if(input.tenderId){ await db.from("tender_document_analyses").upsert({tender_id:input.tenderId,user_id:auth.user.id,document_url:documentUrl,status:"analyzed",extracted_text:extractedText,analysis,updated_at:new Date().toISOString()},{onConflict:"tender_id,user_id"}); }
    await recordUsage(db,auth.user.id);
    return res.status(200).json({tenderId:input.tenderId||null,title:input.title||"Tender",documentUrl,analysis,extractedTextLength:extractedText.length,engine:"vercel-pdf-parse",authenticated:true,entitlement:access});
  }catch(error){const message=errorMessage(error);const status=/not a valid PDF|invalid|not allowed|12MB|HTTP 4\d\d|no public PDF/i.test(message)?422:500;return res.status(status).json({error:message});}
}
