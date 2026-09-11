(() => {
  "use strict";
  let apiBases = [];
  const tokenKey = "ti_access_token";
  const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
  const token = () => localStorage.getItem(tokenKey) || "";
  const saveToken = t => t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey);
  async function json(path, options = {}) {
    let lastError = null;
    for (const base of apiBases) {
      try {
        const r = await fetch(base + path, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}), ...(token() ? { authorization: "Bearer " + token() } : {}) } });
        const d = await r.json().catch(() => ({}));
        if (r.status === 403 || r.status === 404) { lastError = new Error(d.error || `Backend unavailable (HTTP ${r.status})`); continue; }
        if (!r.ok) { const e = new Error(d.error || `Request failed (HTTP ${r.status})`); e.data = d; e.status = r.status; throw e; }
        return d;
      } catch (error) {
        if (error?.status === 401 || error?.status === 400 || error?.status === 402) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error("Authentication backend is unavailable. Please try again shortly.");
  }
  function modal() {
    if (document.querySelector("#tiAccountModal")) return document.querySelector("#tiAccountModal");
    const m = document.createElement("div"); m.id = "tiAccountModal"; m.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.58);display:none;align-items:center;justify-content:center;padding:18px;z-index:1000";
    m.innerHTML = `<div style="width:min(430px,100%);background:#fff;border-radius:15px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:22px"><div style="display:flex;justify-content:space-between;align-items:start;gap:10px"><div><div style="font-size:10px;font-weight:800;color:#1769e8">TENDER INTELLIGENCE</div><h2 id="tiAccountTitle" style="margin:5px 0;font-size:21px">Business login</h2><p id="tiAccountSub" style="margin:0;color:#667085;font-size:11px;line-height:1.5">Sign in to unlock your business workspace and document intelligence.</p></div><button id="tiAccountClose" style="border:0;background:#eef2f7;border-radius:8px;padding:6px 9px;cursor:pointer">×</button></div><div id="tiAccountNotice" style="display:none;margin:14px 0;padding:9px;border-radius:8px;font-size:11px"></div><form id="tiAccountForm" style="display:grid;gap:10px;margin-top:17px"><label style="font-size:11px;font-weight:700">Business email<input id="tiEmail" type="email" required autocomplete="email" style="display:block;width:100%;height:40px;margin-top:5px;border:1px solid #dfe4eb;border-radius:8px;padding:0 11px"></label><label style="font-size:11px;font-weight:700">Password<input id="tiPassword" type="password" required minlength="6" autocomplete="current-password" style="display:block;width:100%;height:40px;margin-top:5px;border:1px solid #dfe4eb;border-radius:8px;padding:0 11px"></label><button id="tiAccountSubmit" class="primary" type="submit" style="height:40px;border:0;border-radius:8px;background:#1769e8;color:#fff;font-weight:800;cursor:pointer">Sign in</button></form><button id="tiToggleMode" style="margin-top:12px;border:0;background:none;color:#1769e8;font-size:11px;cursor:pointer">New business? Start your 24-hour free trial</button></div>`;
    document.body.appendChild(m); m.querySelector("#tiAccountClose").onclick = () => m.style.display = "none";
    m.addEventListener("click", e => { if (e.target === m) m.style.display = "none"; });
    return m;
  }
  function notice(text, ok = false) { const n = modal().querySelector("#tiAccountNotice"); n.textContent = text; n.style.display = "block"; n.style.background = ok ? "#e8f8f0" : "#fff4dc"; n.style.color = ok ? "#0a6b40" : "#8a5700"; }
  function openAccount(signup = false) {
    const m = modal(); m.style.display = "flex"; m.dataset.mode = signup ? "signup" : "signin";
    m.querySelector("#tiAccountTitle").textContent = signup ? "Create business account" : "Business login";
    m.querySelector("#tiAccountSub").textContent = signup ? "Start with a 24-hour free trial. No card is required to start." : "Sign in to unlock your business workspace and document intelligence.";
    m.querySelector("#tiAccountSubmit").textContent = signup ? "Create account & start trial" : "Sign in";
    m.querySelector("#tiToggleMode").textContent = signup ? "Already have an account? Sign in" : "New business? Start your 24-hour free trial";
    m.querySelector("#tiAccountNotice").style.display = "none";
  }
  async function loadConfig() {
    try {
      const r = await fetch("./data/runtime-config.json?ts=" + Date.now(), {cache:"no-store"});
      if (r.ok) {
        const config = await r.json();
        apiBases = [...new Set([...(config.apiBaseUrls || []), config.apiBaseUrl].filter(Boolean))];
      }
    } catch (_) {}
    if (!apiBases.length) apiBases = ["https://tender-intelligence-saas-mrul.vercel.app", "https://tender-intelligence-saas.vercel.app"];
  }
  async function status() { if (!token() || !apiBases.length) return null; try { return await json("/api/billing-status", {method:"GET"}); } catch (_) { return null; } }
  function formatRemaining(iso) { if (!iso) return ""; const ms = new Date(iso).getTime() - Date.now(); if (ms <= 0) return "Trial ended"; const h = Math.floor(ms / 3600000); const min = Math.floor((ms % 3600000) / 60000); return `${h}h ${min}m remaining`; }
  function mountAccountBadge(info) {
    let badge = document.querySelector("#tiAccountBadge"); if (!badge) { badge = document.createElement("div"); badge.id = "tiAccountBadge"; badge.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:50;background:#fff;border:1px solid #dfe4eb;border-radius:12px;box-shadow:0 8px 30px rgba(16,24,40,.12);padding:10px 12px;min-width:205px;font-size:10px"; document.body.appendChild(badge); }
    if (!info) { badge.innerHTML = `<div style="font-weight:800;margin-bottom:7px">Business workspace</div><button id="tiLoginBtn" style="width:100%;border:0;background:#1769e8;color:#fff;border-radius:7px;padding:8px;font-weight:800;cursor:pointer">Login / Start free trial</button>`; badge.querySelector("#tiLoginBtn").onclick = () => openAccount(false); return; }
    const e = info.entitlement || {}; const active = e.allowed; const trial = e.state === "trial";
    badge.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(info.user?.email || "Business account")}</b><button id="tiLogout" style="border:0;background:none;color:#667085;cursor:pointer;font-size:10px">Sign out</button></div><div style="margin-top:7px;color:${active ? "#0a8f55" : "#d92d20"};font-weight:800">${trial ? "24-hour free trial" : active ? "Pro active" : "Trial ended"}</div><div style="margin-top:3px;color:#667085">${trial ? esc(formatRemaining(e.trialEndsAt)) : active ? "Document intelligence enabled" : "Upgrade required"}</div>${active ? (e.state === "active" ? '<button id="tiPortal" style="margin-top:8px;width:100%;border:1px solid #dfe4eb;background:#fff;border-radius:7px;padding:7px;font-weight:700;cursor:pointer">Manage billing</button>' : '') : '<button id="tiUpgrade" style="margin-top:8px;width:100%;border:0;background:#1769e8;color:#fff;border-radius:7px;padding:8px;font-weight:800;cursor:pointer">Upgrade to Pro</button>'}`;
    badge.querySelector("#tiLogout").onclick = () => { saveToken(""); mountAccountBadge(null); alert("Signed out on this browser."); };
    const upgrade = badge.querySelector("#tiUpgrade"); if (upgrade) upgrade.onclick = startCheckout;
    const portal = badge.querySelector("#tiPortal"); if (portal) portal.onclick = openPortal;
  }
  async function startCheckout() { try { if (!token()) return openAccount(false); const d = await json("/api/create-checkout-session", {method:"POST",body:"{}"}); if (d.url) window.location.href = d.url; } catch (e) { if (e.status === 401) { saveToken(""); openAccount(false); } else alert(e.message); } }
  async function openPortal() { try { const d = await json("/api/create-portal-session", {method:"POST",body:"{}"}); if (d.url) window.location.href = d.url; } catch (e) { alert(e.message); } }
  async function submitAccount(e) {
    e.preventDefault(); const m = modal(); const signup = m.dataset.mode === "signup"; const email = m.querySelector("#tiEmail").value.trim(); const password = m.querySelector("#tiPassword").value; const button = m.querySelector("#tiAccountSubmit"); button.disabled = true; button.textContent = signup ? "Creating…" : "Signing in…";
    try {
      const d = await json(signup ? "/api/auth-signup" : "/api/auth-signin", {method:"POST",body:JSON.stringify({email,password}),headers:{}});
      if (!d.session?.access_token) { notice("Account created. Check your email to confirm the account, then sign in.", true); return; }
      saveToken(d.session.access_token); m.style.display = "none"; mountAccountBadge(await status());
    } catch (err) { notice(err.message || "Authentication failed"); }
    finally { button.disabled = false; button.textContent = signup ? "Create account & start trial" : "Sign in"; }
  }
  function bind() {
    const m = modal(); m.querySelector("#tiAccountForm").onsubmit = submitAccount; m.querySelector("#tiToggleMode").onclick = () => openAccount(m.dataset.mode !== "signup");
    document.addEventListener("click", e => { const b = e.target.closest?.("button"); if (!b) return; if (/upgrade plan/i.test(b.textContent || "")) { e.preventDefault(); startCheckout(); } if (/sign out/i.test(b.textContent || "") && b.id !== "tiLogout") { saveToken(""); mountAccountBadge(null); } }, true);
  }
  async function boot() { await loadConfig(); bind(); const info = await status(); mountAccountBadge(info); window.__tiOpenLogin = () => openAccount(false); window.__tiStartCheckout = startCheckout; }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true}); else boot();
})();
