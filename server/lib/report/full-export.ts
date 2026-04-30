import type { AuditReport } from "./schema";

export function renderFullHtml(report: AuditReport, autoPrint = false): string {
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
  const topActions = report.top_actions ?? [];
  const competitors = report.competitors ?? [];
  const tiers = report.keyword_tiers ?? { primary: [], secondary: [], tertiary: [] };
  const skill = report.skill_based_summary ?? {};
  const todo = report.todo_list ?? [];
  const plan = report.implementation_plan ?? [];
  const pages = report.pages ?? [];

  const printScript = autoPrint
    ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 500));<\/script>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Full SEO Audit — ${esc(report.site_name)}</title>
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
      max-width: 920px;
      margin: 0 auto;
      padding: 48px 40px 64px;
    }
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
    .cover h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
    .cover .url { color: var(--mute); font-size: 13px; margin-bottom: 12px; }
    .cover-meta { display: flex; gap: 24px; flex-wrap: wrap; font-size: 12px; color: var(--mute); }
    .cover-meta strong { color: var(--text); }
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
    h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--mute); margin-bottom: 8px; }
    section { margin-bottom: 32px; }
    .score-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
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
    .cat-rows { display: grid; gap: 10px; }
    .cat-row { display: flex; align-items: center; gap: 10px; }
    .cat-row .cat-label { width: 80px; font-size: 12px; color: var(--mute); flex-shrink: 0; }
    .cat-bar-wrap { flex: 1; height: 10px; border-radius: 999px; }
    .cat-row .cat-val { width: 28px; text-align: right; font-size: 12px; font-weight: 600; }
    .trinity-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .trinity-card { border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--surface); }
    .trinity-card .t-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--accent); margin-bottom: 8px; }
    .trinity-card p { font-size: 12px; color: #374151; line-height: 1.6; }
    ol.actions, ul.bullets { padding-left: 22px; display: grid; gap: 7px; }
    ol.actions li, ul.bullets li { font-size: 13px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .panel { border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--surface); }
    .pill-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { background: #dbeafe; color: #1d4ed8; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 500; }
    .pill.secondary { background: #fef3c7; color: #92400e; }
    .pill.tertiary { background: #f3f4f6; color: #374151; }
    .comp-row { display: flex; flex-direction: column; gap: 1px; margin-bottom: 8px; }
    .comp-name { font-size: 13px; font-weight: 600; }
    .comp-note { font-size: 11px; color: var(--mute); }
    .geo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .geo-item { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; }
    .geo-item .icon { font-size: 14px; line-height: 1; flex-shrink: 0; margin-top: 1px; }
    .eeat-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
    .eeat-pill { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 4px; padding: 1px 8px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th { text-align: left; font-size: 11px; font-weight: 700; color: var(--mute); text-transform: uppercase; letter-spacing: .05em; padding: 6px 10px; border-bottom: 1px solid var(--border); }
    tbody tr:nth-child(even) { background: var(--surface); }
    tbody td { padding: 8px 10px; vertical-align: top; border-bottom: 1px solid var(--border); }
    .pri-badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .pri-high { background: #fef2f2; color: #b91c1c; }
    .pri-critical { background: #fff7ed; color: #c2410c; }
    .pri-medium { background: #fffbeb; color: #92400e; }
    .pri-low { background: #f0fdf4; color: #166534; }
    .skill-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .skill-card { border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: var(--surface); }
    .skill-card .s-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--accent); margin-bottom: 6px; }
    .skill-card p { font-size: 12px; line-height: 1.6; color: #374151; }
    .url-cell { word-break: break-all; max-width: 320px; font-size: 11px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 11px; color: var(--mute); display: flex; justify-content: space-between; }
    @media print {
      body { font-size: 11px; }
      .page { padding: 24px 28px 40px; }
      .score-card, .panel, .trinity-card, .skill-card { break-inside: avoid; }
      section { break-inside: avoid; }
      .trinity-grid, .skill-grid { grid-template-columns: 1fr; gap: 8px; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      h2 { break-after: avoid; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="cover">
    <div class="cover-label">Full SEO Audit Report</div>
    <h1>${esc(report.site_name)}</h1>
    <div class="url">${esc(report.source_value)}</div>
    <div class="cover-meta">
      <span><strong>Date:</strong> ${generated}</span>
      <span><strong>Pages audited:</strong> ${report.pages_audited ?? 0}</span>
      <span><strong>Pages discovered:</strong> ${report.pages_discovered ?? 0}</span>
    </div>
  </div>

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

  ${trinity.seo || trinity.geo || trinity.ux ? `
  <section>
    <h2>Trinity Review</h2>
    <div class="trinity-grid">
      ${trinity.seo ? trinityCard("SEO", trinity.seo) : ""}
      ${trinity.geo ? trinityCard("GEO / AI", trinity.geo) : ""}
      ${trinity.ux ? trinityCard("UX / CRO", trinity.ux) : ""}
    </div>
  </section>` : ""}

  ${topActions.length > 0 ? `
  <section>
    <h2>Top Actions</h2>
    <ol class="actions">
      ${topActions.map((a) => `<li>${esc(a)}</li>`).join("\n      ")}
    </ol>
  </section>` : ""}

  ${(tiers.primary?.length || tiers.secondary?.length || tiers.tertiary?.length || competitors.length > 0) ? `
  <section>
    <h2>Keyword Tiers &amp; Competitors</h2>
    <div class="two-col">
      <div class="panel">
        ${tiers.primary?.length ? `<h3>Primary</h3><div class="pill-list" style="margin-bottom:10px">${tiers.primary.map((k: any) => `<span class="pill">${esc(String(k))}</span>`).join("")}</div>` : ""}
        ${tiers.secondary?.length ? `<h3>Secondary</h3><div class="pill-list" style="margin-bottom:10px">${tiers.secondary.map((k: any) => `<span class="pill secondary">${esc(String(k))}</span>`).join("")}</div>` : ""}
        ${tiers.tertiary?.length ? `<h3>Tertiary</h3><div class="pill-list">${tiers.tertiary.map((k: any) => `<span class="pill tertiary">${esc(String(k))}</span>`).join("")}</div>` : ""}
      </div>
      ${competitors.length > 0 ? `
      <div class="panel">
        <h3>Competitors</h3>
        ${competitors.map((c) => `
        <div class="comp-row">
          <span class="comp-name">${esc(c.name ?? "")}</span>
          ${c.note ? `<span class="comp-note">${esc(c.note)}</span>` : ""}
        </div>`).join("")}
      </div>` : ""}
    </div>
  </section>` : ""}

  ${geo ? `
  <section>
    <h2>GEO / AI Readiness</h2>
    <div class="panel">
      <div class="geo-grid">
        ${check("llms.txt present", geo.llms_txt)}
        ${check("FAQ section", geo.faq_section)}
        ${check("Direct answer in first 200 words", geo.direct_answer_potential)}
        ${geoText("Citation readiness", geo.citation_readiness)}
        ${geoText("Information gain", geo.information_gain)}
        ${geoText("Brand authority", geo.brand_authority)}
      </div>
      ${geo.structured_data && geo.structured_data.length > 0 ? `<div style="margin-top:10px;font-size:12px"><strong>Structured data:</strong> ${geo.structured_data.map(esc).join(", ")}</div>` : ""}
      ${geo.missing_schema && geo.missing_schema.length > 0 ? `<div style="margin-top:6px;font-size:12px"><strong>Missing schema:</strong> ${geo.missing_schema.map(esc).join(", ")}</div>` : ""}
      ${geo.eeat_signals && geo.eeat_signals.length > 0 ? `
      <div class="eeat-list">
        ${geo.eeat_signals.map((s) => `<span class="eeat-pill">${esc(s)}</span>`).join("")}
      </div>` : ""}
    </div>
  </section>` : ""}

  ${(skill.on_page || skill.content || skill.technical || skill.schema_geo) ? `
  <section>
    <h2>Skill-Based Summary</h2>
    <div class="skill-grid">
      ${skill.on_page ? skillCard("On-Page", skill.on_page) : ""}
      ${skill.content ? skillCard("Content", skill.content) : ""}
      ${skill.technical ? skillCard("Technical", skill.technical) : ""}
      ${skill.schema_geo ? skillCard("Schema / GEO", skill.schema_geo) : ""}
    </div>
  </section>` : ""}

  ${todo.length > 0 ? `
  <section>
    <h2>Todo List (${todo.length})</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Issue</th>
          <th>Fix</th>
          <th>Priority</th>
          <th>Pages</th>
        </tr>
      </thead>
      <tbody>
        ${todo.map((t: any, i: number) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(t.issue ?? "")}</td>
          <td>${esc(t.fix ?? "")}</td>
          <td>${priBadge(t.priority ?? t.severity ?? t.importance ?? "")}</td>
          <td>${esc(String(t.pages_affected ?? "—"))}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </section>` : ""}

  ${plan.length > 0 ? `
  <section>
    <h2>Implementation Plan (${plan.length})</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Action</th>
          <th>Priority</th>
          <th>Effort</th>
          <th>Expected Impact</th>
        </tr>
      </thead>
      <tbody>
        ${plan.map((p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(p.action)}${p.completed ? ' <span style="color:var(--good)">✓</span>' : ""}</td>
          <td>${priBadge(p.priority ?? "")}</td>
          <td>${esc(p.effort ?? "—")}</td>
          <td>${esc(p.expected_impact ?? "—")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </section>` : ""}

  ${pages.length > 0 ? `
  <section>
    <h2>Pages (${pages.length})</h2>
    <table>
      <thead>
        <tr>
          <th>URL</th>
          <th>Title</th>
          <th>Score</th>
          <th>Tech</th>
          <th>On-Page</th>
          <th>Content</th>
          <th>Links</th>
          <th>Schema</th>
          <th>GEO</th>
        </tr>
      </thead>
      <tbody>
        ${pages.map((p: any) => `
        <tr>
          <td class="url-cell">${esc(p.url ?? "")}</td>
          <td>${esc(p.title ?? "")}</td>
          <td><strong>${p.score ?? "—"}</strong></td>
          <td>${p.technical ?? "—"}</td>
          <td>${p.on_page ?? "—"}</td>
          <td>${p.content ?? "—"}</td>
          <td>${p.links ?? "—"}</td>
          <td>${p.schema ?? "—"}</td>
          <td>${p.geo ?? "—"}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </section>` : ""}

  <div class="footer">
    <span>SEO Audit Studio · Full Report</span>
    <span>${esc(report.source_value)}</span>
  </div>

</div>
</body>
</html>`;
}

function esc(s: string): string {
  return (s ?? "")
    .toString()
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

function skillCard(label: string, text: string): string {
  return `<div class="skill-card">
    <div class="s-label">${label}</div>
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

function priBadge(p: string): string {
  if (!p) return "—";
  const lp = p.toLowerCase();
  const cls = lp === "critical" ? "pri-critical"
    : lp === "high" ? "pri-high"
    : lp === "medium" ? "pri-medium"
    : "pri-low";
  return `<span class="pri-badge ${cls}">${esc(p)}</span>`;
}
