import { claudeText, extractJson, isClaudeAvailable } from "../client";
import type { AuditReport } from "../../report/schema";

export type Narrative = {
  trinity_review: { seo: string; geo: string; ux: string };
  skill_based_summary: {
    on_page: string;
    content: string;
    technical: string;
    schema_geo: string;
  };
  keyword_tiers: {
    primary: string[];
    secondary: string[];
    tertiary: string[];
  };
  competitors: Array<{ name: string; note: string }>;
  top_actions: string[];
};

const SYSTEM = `You are a senior SEO + GEO consultant writing the narrative sections of an audit report.

Output is ALWAYS a single JSON object. No prose before or after, no markdown fences.

Required schema:
{
  "trinity_review": { "seo": "...", "geo": "...", "ux": "..." },
  "skill_based_summary": {
    "on_page": "...", "content": "...", "technical": "...", "schema_geo": "..."
  },
  "keyword_tiers": {
    "primary":   ["...", "..."],
    "secondary": ["...", "..."],
    "tertiary":  ["...", "..."]
  },
  "competitors": [{ "name": "...", "note": "..." }],
  "top_actions": ["...", "..."]
}

Rules:
- Trinity review: one tight paragraph each, concrete and specific to this site.
- Skill-based summary: one or two sentences each, grounded in actual findings.
- Keyword tiers: 3–5 each. Primary = broad high-volume; secondary = 2–3 word variants; tertiary = long-tail/question-based.
- Competitors: 3–5 plausible direct competitors. Include a one-line note.
- Top actions: 5–7 highest-impact remediations, single imperative sentence each.
- Reference the site's actual scores and weakest categories.
- Do not invent features or pages that aren't in the report.`;

export async function generateNarrative(
  report: AuditReport,
): Promise<Narrative | null> {
  if (!(await isClaudeAvailable())) return null;

  const summary = {
    site_name: report.site_name,
    source_value: report.source_value,
    site_overall_score: report.site_overall_score,
    site_seo_score: report.site_seo_score,
    site_geo_score: report.site_geo_score,
    site_category_averages: report.site_category_averages,
    countries: report.countries,
    pages: report.pages.slice(0, 25).map((p) => ({
      url: p.url,
      type: p.type,
      title: p.title,
      h1: p.h1,
      meta_description: p.meta_description,
      json_ld_types: p.json_ld_types,
      score: p.score,
      technical: p.technical,
      on_page: p.on_page,
      content: p.content,
      links: p.links,
      schema: p.schema,
      geo: p.geo,
      issues: p.issues?.slice(0, 6),
    })),
    todo_list: report.todo_list.slice(0, 20),
    geo_readiness: report.geo_readiness,
  };

  const prompt = [
    "Audit report (JSON):",
    JSON.stringify(summary, null, 2),
    "",
    "Write the narrative sections per the schema. Be specific to this site.",
    "Return ONLY the JSON object. No prose, no markdown fences.",
  ].join("\n");

  // First attempt
  const text = await claudeText({
    prompt,
    system: SYSTEM,
    maxTurns: 1,
    timeoutMs: 180_000,
  });
  const first = extractJson<Narrative>(text);
  if (first && first.trinity_review) return first;

  // Retry with an explicit "JSON only" nudge — common failure mode is the
  // model including a "Here is the JSON:" preamble or a trailing note.
  console.warn(
    "[narrative] first attempt didn't parse as JSON, retrying with stricter nudge",
  );
  const retryPrompt = [
    prompt,
    "",
    "REMINDER: Your previous response was not parseable JSON.",
    "Output ONLY the raw JSON object — start with { and end with }.",
    "No preamble, no commentary, no markdown fences, no trailing notes.",
  ].join("\n");

  const retryText = await claudeText({
    prompt: retryPrompt,
    system: SYSTEM,
    maxTurns: 1,
    timeoutMs: 180_000,
  });
  return extractJson<Narrative>(retryText);
}
