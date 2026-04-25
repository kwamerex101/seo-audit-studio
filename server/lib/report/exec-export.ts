import type { AuditReport } from "../report/schema";

export function renderExecHtml(report: AuditReport, autoPrint = false): string {
  const generated = new Date(report.generated_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const cats = report.site_category_averages ?? {};
  const catRows = [
    ["Technical", cats.technical],
    ["On-Page", cats.on_page],
    ["Content", cats.content],
    ["Links", cats.links],
    ["Schema", cats.schema],
    ["GEO", cats.geo],
  ] as [string, number | undefined][];

  const trinity = report.trinity_review ?? {};
  const geo = report.geo_readiness;
  const topActions = (report.top_actions ?? []).slice(0, 7);
  const competitors = report.competitors ?? [];
  const primaryKeywords = (report.keyword_tiers?.primary ?? []).slice(0, 6);
  const highPriorityPlan = (report.implementation_plan ?? [])
    .filter((p) => !p.completed && (p.priority === "High" || p.priority === "high" || p.priority === "Critical" || p.priority === "critical"))
    .slice(0, 10);

  const printScript = autoPrint
    ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 500));<\/script>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Executive Report — ${esc(report.site_name)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${printScript}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    :root {
      --text: #111827;
      --mute: #6b7280;
      --bg: #ffffff;
      --surface: #f9fafb;
      --border: #e5e7eb;
      --accent: #2563eb;
      --good: #16a34a;
      --warn: #d97706;
      --bad: #dc2626;
    }
    body {
      font-family: "Helvetica Neue", Arial, "Liberation Sans", sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.6;
    }
    .page {
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 40px 64px;
    }

    /* ── Cover ─────────────────────────────────── */
    .cover {
      border-bottom: 2px solid var(--accent);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .cover-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 8px;
    }
    .cover h1 {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }
    .cover .url { color: var(--mute); font-size: 13px; margin-bottom: 12px; }
    .cover-meta {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      font-size: 12px;
      color: var(--mute);
    }
    .cover-meta strong { color: var(--text); }

    /* ── Section heading ────────────────────────── */
    h2 {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    section { margin-bottom: 32px; }

    /* ── Score grid ─────────────────────────────── */
    .score-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .score-card {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px 16px;
      text-align: center;
      background: var(--surface);
    }
    .score-card .label { font-size: 11px; font-weight: 600; color: var(--mute); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
    .score-card .value { font-size: 40px; font-weight: 800; line-height: 1; }
    .score-card .denom { font-size: 13px; color: var(--mute); }
    .score-card.good .value { color: var(--good); }
    .score-card.warn .value { color: var(--warn); }
    .score-card.bad .value { color: var(--bad); }

    /* ── Category bars ──────────────────────────── */
    .cat-rows { display: grid; gap: 10px; }
    .cat-row { display: flex; align-items: center; gap: 10px; }
    .cat-row .cat-label { width: 80px; font-size: 12px; color: var(--mute); flex-shrink: 0; }
    .cat-bar-wrap {
      flex: 1;
      height: 10px;
      border-radius: 999px;
      /* single-element gradient — no overflow:hidden needed, prints correctly */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cat-row .cat-val { width: 28px; text-align: right; font-size: 12px; font-weight: 600; }

    /* ── Narrative cards ────────────────────────── */
    .trinity-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .trinity-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      background: var(--surface);
    }
    .trinity-card .t-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--accent);
      margin-bottom: 8px;
    }
    .trinity-card p { font-size: 12px; color: #374151; line-height: 1.6; }

    /* ── Ordered list ───────────────────────────── */
    ol.actions {
      padding-left: 22px;
      display: grid;
      gap: 7px;
    }
    ol.actions li { font-size: 13px; }

    /* ── Two-col layout ─────────────────────────── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .panel {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      background: var(--surface);
    }
    .panel h3 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--mute); margin-bottom: 10px; }
    .pill-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill {
      background: #dbeafe;
      color: #1d4ed8;
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 500;
    }
    .comp-row { display: flex; flex-direction: column; gap: 1px; margin-bottom: 8px; }
    .comp-name { font-size: 13px; font-weight: 600; }
    .comp-note { font-size: 11px; color: var(--mute); }

    /* ── GEO readiness ──────────────────────────── */
    .geo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .geo-item { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; }
    .geo-item .icon { font-size: 14px; line-height: 1; flex-shrink: 0; margin-top: 1px; }
    .eeat-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
    .eeat-pill {
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
      border-radius: 4px;
      padding: 1px 8px;
      font-size: 11px;
    }

    /* ── Roadmap table ──────────────────────────── */
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      color: var(--mute);
      text-transform: uppercase;
      letter-spacing: .05em;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
    }
    tbody tr:nth-child(even) { background: var(--surface); }
    tbody td { padding: 8px 10px; vertical-align: top; border-bottom: 1px solid var(--border); }
    .pri-badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .pri-high { background: #fef2f2; color: #b91c1c; }
    .pri-critical { background: #fff7ed; color: #c2410c; }
    .pri-medium { background: #fffbeb; color: #92400e; }
    .pri-low { background: #f0fdf4; color: #166534; }

    /* ── Footer ─────────────────────────────────── */
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--mute);
      display: flex;
      justify-content: space-between;
    }

    /* ── Print ──────────────────────────────────── */
    @media print {
      body { font-size: 11px; }
      .page { padding: 24px 28px 40px; }
      .score-card, .panel, .trinity-card { break-inside: avoid; }
      section { break-inside: avoid; }
      .trinity-grid { grid-template-columns: 1fr; gap: 8px; }
      h2 { break-after: avoid; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Cover -->
  <div class="cover">
    <div class="cover-label">Executive Report</div>
    <h1>${esc(report.site_name)}</h1>
    <div class="url">${esc(report.source_value)}</div>
    <div class="cover-meta">
      <span><strong>Date:</strong> ${generated}</span>
      <span><strong>Pages audited:</strong> ${report.pages_audited ?? 0}</span>
      <span><strong>Pages discovered:</strong> ${report.pages_discovered ?? 0}</span>
    </div>
  </div>

  <!-- Score Overview -->
  <section>
    <h2>Score Overview</h2>
    <div class="score-grid">
      ${scoreCard("Overall", report.site_overall_score)}
      ${scoreCard("SEO", report.site_seo_score)}
      ${scoreCard("GEO / AI Visibility", report.site_geo_score)}
    </div>
    <div class="cat-rows">
      ${catRows.filter(([, v]) => v !== undefined).map(([label, val]) => catBar(label, val!)).join("\n      ")}
    </div>
  </section>

  <!-- Executive Summary -->
  ${trinity.seo || trinity.geo || trinity.ux ? `
  <section>
    <h2>Executive Summary</h2>
    <div class="trinity-grid">
      ${trinity.seo ? trinityCard("SEO", trinity.seo) : ""}
      ${trinity.geo ? trinityCard("GEO / AI", trinity.geo) : ""}
      ${trinity.ux ? trinityCard("UX / CRO", trinity.ux) : ""}
    </div>
  </section>` : ""}

  <!-- Top Recommendations -->
  ${topActions.length > 0 ? `
  <section>
    <h2>Top Recommendations</h2>
    <ol class="actions">
      ${topActions.map((a) => `<li>${esc(a)}</li>`).join("\n      ")}
    </ol>
  </section>` : ""}

  <!-- Competitive Landscape -->
  ${(competitors.length > 0 || primaryKeywords.length > 0) ? `
  <section>
    <h2>Competitive Landscape &amp; Keywords</h2>
    <div class="two-col">
      ${competitors.length > 0 ? `
      <div class="panel">
        <h3>Key Competitors</h3>
        ${competitors.map((c) => `
        <div class="comp-row">
          <span class="comp-name">${esc(c.name ?? "")}</span>
          ${c.note ? `<span class="comp-note">${esc(c.note)}</span>` : ""}
        </div>`).join("")}
      </div>` : ""}
      ${primaryKeywords.length > 0 ? `
      <div class="panel">
        <h3>Primary Keywords</h3>
        <div class="pill-list">
          ${primaryKeywords.map((k) => `<span class="pill">${esc(String(k))}</span>`).join("\n          ")}
        </div>
      </div>` : ""}
    </div>
  </section>` : ""}

  <!-- GEO / AI Readiness -->
  ${geo ? `
  <section>
    <h2>AI &amp; GEO Readiness</h2>
    <div class="geo-grid">
      ${check("llms.txt present", geo.llms_txt)}
      ${check("FAQ section", geo.faq_section)}
      ${check("Direct answer in first 200 words", geo.direct_answer_potential)}
      ${geoText("Citation readiness", geo.citation_readiness)}
      ${geoText("Information gain", geo.information_gain)}
      ${geoText("Brand authority", geo.brand_authority)}
    </div>
    ${geo.eeat_signals && geo.eeat_signals.length > 0 ? `
    <div class="eeat-list">
      ${geo.eeat_signals.map((s) => `<span class="eeat-pill">${esc(s)}</span>`).join("\n      ")}
    </div>` : ""}
  </section>` : ""}

  <!-- Priority Roadmap -->
  ${highPriorityPlan.length > 0 ? `
  <section>
    <h2>Priority Roadmap</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Action</th>
          <th>Effort</th>
          <th>Expected Impact</th>
        </tr>
      </thead>
      <tbody>
        ${highPriorityPlan.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(item.action)}</td>
          <td>${esc(item.effort ?? "—")}</td>
          <td>${esc(item.expected_impact ?? "—")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </section>` : ""}

  <div class="footer">
    <span>SEO Audit Studio · Executive Report</span>
    <span>${esc(report.source_value)}</span>
  </div>

</div>
</body>
</html>`;
}

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreCard(label: string, value: number): string {
  const cls = value >= 70 ? "good" : value >= 40 ? "warn" : "bad";
  return `<div class="score-card ${cls}">
    <div class="label">${label}</div>
    <div class="value">${value}</div>
    <div class="denom">/ 100</div>
  </div>`;
}

function catBar(label: string, value: number): string {
  const color = value >= 70 ? "var(--good)" : value >= 40 ? "var(--warn)" : "var(--bad)";
  const pct = Math.min(100, Math.max(0, value));
  const gradient = `linear-gradient(to right, ${color} ${pct}%, var(--border) ${pct}%)`;
  return `<div class="cat-row">
    <span class="cat-label">${label}</span>
    <div class="cat-bar-wrap" style="background:${gradient}"></div>
    <span class="cat-val">${value}</span>
  </div>`;
}

function trinityCard(label: string, text: string): string {
  return `<div class="trinity-card">
    <div class="t-label">${label}</div>
    <p>${esc(text)}</p>
  </div>`;
}

function check(label: string, val: boolean | undefined): string {
  if (val === undefined) return "";
  const icon = val ? "✅" : "❌";
  return `<div class="geo-item"><span class="icon">${icon}</span><span>${label}</span></div>`;
}

function geoText(label: string, val: string | undefined): string {
  if (!val || val === "pending_ai" || val === "pending") return "";
  const icon = val.toLowerCase().includes("high") || val.toLowerCase().includes("strong")
    ? "✅"
    : val.toLowerCase().includes("low") || val.toLowerCase().includes("weak")
    ? "❌"
    : "⚠️";
  return `<div class="geo-item"><span class="icon">${icon}</span><span><strong>${label}:</strong> ${esc(val)}</span></div>`;
}
