(() => {
  let apiBase = "";
  let runtimeTenders = [];
  const escHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  const modal = () => document.querySelector("#staticAnalysisModal");
  const titleEl = () => document.querySelector("#staticAnalysisTitle");
  const bodyEl = () => document.querySelector("#staticAnalysisBody");
  const show = (title, html) => { titleEl().textContent = title || "Tender Analysis"; bodyEl().innerHTML = html; modal().style.display = "flex"; };
  const message = (title, text) => show(title, `<div class="staticAnalysisWarn">${escHtml(text)}</div>`);

  async function loadConfig() {
    try {
      const response = await fetch("./data/runtime-config.json?ts=" + Date.now(), { cache: "no-store" });
      if (response.ok) apiBase = (await response.json()).apiBaseUrl || "";
    } catch (_) {}
    try {
      const response = await fetch("./data/tenders.json?ts=" + Date.now(), { cache: "no-store" });
      if (response.ok) runtimeTenders = (await response.json()).tenders || [];
    } catch (_) {}
  }

  async function signInOrSignUp() {
    const existing = localStorage.getItem("ti_access_token");
    if (existing) return existing;
    const email = window.prompt("Tender Intelligence login email:");
    if (!email) return null;
    const password = window.prompt("Tender Intelligence password:");
    if (!password) return null;
    const post = async (path) => {
      const response = await fetch(apiBase + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Authentication failed (HTTP ${response.status})`);
      return data;
    };
    try {
      const data = await post("/api/auth-signin");
      localStorage.setItem("ti_access_token", data.session.access_token);
      return data.session.access_token;
    } catch (error) {
      if (!window.confirm("Sign-in failed. Create a new Tender Intelligence account with this email?")) throw error;
      const data = await post("/api/auth-signup");
      if (!data.session?.access_token) throw new Error("Account created. Confirm the email if Supabase email confirmation is enabled, then sign in again.");
      localStorage.setItem("ti_access_token", data.session.access_token);
      return data.session.access_token;
    }
  }

  function findTenderFromCard(card) {
    const title = card?.querySelector(".tTitle")?.textContent?.trim();
    if (!title) return null;
    return runtimeTenders.find((t) => t.title === title) || null;
  }

  function renderLiveResult(result) {
    const a = result.analysis || {};
    const e = a.eligibility || {};
    const m = result.match;
    const el = result.eligibility;
    const evidence = (a.evidence || []).map((x) => `<li><b>${escHtml(x.requirement)}:</b> ${escHtml(x.value)} <span style="color:#667085">(${Math.round((x.confidence || 0) * 100)}%)</span></li>`).join("") || "<li>No standard evidence was confidently extracted.</li>";
    const warnings = (a.warnings || []).map((x) => `<li>${escHtml(x)}</li>`).join("");
    const matchHtml = m ? `<div class="staticAnalysisSection"><h3>Match & eligibility</h3><div class="staticAnalysisGrid"><div class="staticAnalysisMetric"><b>Match</b><span>${escHtml(m.score)}/100</span></div><div class="staticAnalysisMetric"><b>Recommendation</b><span>${escHtml(m.recommendation)}</span></div><div class="staticAnalysisMetric"><b>Pre-screen</b><span>${escHtml(el?.recommendation || "REVIEW")}</span></div></div></div>` : "";
    const warningHtml = warnings ? `<div class="staticAnalysisSection"><h3>Warnings</h3><ul>${warnings}</ul></div>` : "";
    show(result.title || "Tender Analysis", `<div class="staticAnalysisSection"><h3>Eligibility evidence</h3><ul>${evidence}</ul></div>${matchHtml}${warningHtml}<div class="staticAnalysisSection"><h3>Extracted fields</h3><ul><li>Turnover: ${escHtml(e.turnover || "Not found")}</li><li>Experience: ${escHtml(e.experience || "Not found")}</li><li>EMD: ${escHtml(e.emd || "Not found")}</li><li>Deadline: ${escHtml(e.deadline || "Not found")}</li><li>Certifications: ${escHtml((e.certifications || []).join(", ") || "Not found")}</li></ul></div><div class="staticAnalysisSection"><div class="staticAnalysisWarn">${escHtml(a.disclaimer || "Verify every requirement against the original tender document.")}</div></div>`);
  }

  async function analyzeTender(button, event) {
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const tender = findTenderFromCard(button.closest(".tender"));
    if (!tender) return message("Tender Analysis", "The selected tender could not be identified. Refresh the dashboard and try again.");
    if (!apiBase) return message("Backend not configured", "The dashboard is live, but TENDER_API_BASE_URL is not configured yet. Deploy the Vercel API and set the Pages repository secret TENDER_API_BASE_URL to its production URL.");
    show(tender.title, '<div class="loading">Analyzing the tender document securely…</div>');
    try {
      const token = await signInOrSignUp();
      if (!token) return message(tender.title, "Login is required before document analysis.");
      const profileId = document.querySelector("#profile")?.value || "";
      const response = await fetch(apiBase + "/api/analyze-tender", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ tenderId: tender.id, profileId: profileId || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { localStorage.removeItem("ti_access_token"); return message(tender.title, "Your session expired. Click Analyze Tender again to sign in."); }
      if (!response.ok) return message(tender.title, data.error || `Analysis failed (HTTP ${response.status}).`);
      renderLiveResult(data);
    } catch (error) {
      message(tender.title, error instanceof Error ? error.message : "Network error while contacting the analysis backend.");
    }
  }

  function addSourceStatus() {
    fetch("./data/tenders.json?ts=" + Date.now(), { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((snapshot) => {
      if (!snapshot) return;
      const existing = document.querySelector("#sourceStatus"); if (existing) existing.remove();
      const statuses = (snapshot.sourceStatus || []).map((x) => `<span title="${escHtml(x.error || x.status)}" style="display:inline-flex;align-items:center;gap:5px;margin:3px 7px 3px 0;padding:5px 8px;border:1px solid #e5e9f0;border-radius:999px;font-size:10px;background:#fff"><b style="color:${x.status === "ok" ? "#0a8f55" : "#b26a00"}">${x.status === "ok" ? "●" : "○"}</b>${escHtml(x.source)} ${x.count ? `(${x.count})` : ""}</span>`).join("");
      const node = document.createElement("div"); node.id = "sourceStatus"; node.style.cssText = "margin:0 0 14px;padding:11px 13px;background:#fff;border:1px solid #e5e9f0;border-radius:11px;box-shadow:0 4px 18px rgba(16,24,40,.04)"; node.innerHTML = `<div style="font-size:11px;font-weight:800;margin-bottom:5px">Live source status · ${escHtml(snapshot.status || "unknown")} · ${escHtml(snapshot.count || 0)} tenders</div>${statuses || "<span style='font-size:10px;color:#667085'>No source results in this snapshot.</span>"}`;
      document.querySelector(".content")?.prepend(node);
    }).catch(() => {});
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (!button || !/analyze tender/i.test(button.textContent || "")) return;
    analyzeTender(button, event);
  }, true);

  loadConfig().finally(addSourceStatus);
})();
