import { aiText, extractJson } from "../client";
import type { AuditReport } from "../../report/schema";

export type CompanySummary = {
  tagline: string;
  what_they_do: string;
  who_they_serve: string;
  services: string[];
  positioning: string;
  things_to_know: string[];
  generated_at: string;
  source_audit_id?: string;
};

const SYSTEM = `You synthesize what a company does from its website audit data.

Output is ALWAYS a single JSON object — no prose before or after, no markdown fences.

Required schema:
{
  "tagline": "<one sentence, ~12 words, what the company does in plain English>",
  "what_they_do": "<one tight paragraph (3-5 sentences) on the core offering>",
  "who_they_serve": "<one paragraph (2-4 sentences) on target customers / industries>",
  "services": ["<3-7 specific services or product lines, each a short noun phrase>"],
  "positioning": "<one paragraph (2-4 sentences) on how they differentiate / their angle>",
  "things_to_know": ["<3-6 facts an account manager should know — credentials, certifications, geographic focus, partnerships, notable claims>"]
}

Rules:
- Ground every statement in the provided audit data (titles, H1s, meta descriptions, content snippets, JSON-LD types).
- Never invent customers, awards, or partnerships not in the data.
- If the data is thin (small site), say so explicitly — don't pad.
- Keep "services" and "things_to_know" as crisp noun phrases, not full sentences.
- Avoid generic marketing fluff ("industry-leading", "innovative", "cutting-edge").`;

function compactReport(report: AuditReport) {
  return {
    site_name: report.site_name,
    source_value: report.source_value,
    countries: report.countries,
    pages: report.pages.slice(0, 30).map((p) => ({
      url: p.url,
      type: p.type,
      title: p.title,
      h1: p.h1,
      meta_description: p.meta_description,
      json_ld_types: p.json_ld_types,
    })),
    keyword_tiers: report.keyword_tiers,
    competitors: report.competitors,
    geo_readiness: {
      structured_data: report.geo_readiness?.structured_data,
      direct_answer_potential: report.geo_readiness?.direct_answer_potential,
    },
  };
}

export async function generateCompanySummary(args: {
  report: AuditReport;
  companyName: string;
}): Promise<CompanySummary | null> {
  const compact = compactReport(args.report);
  const prompt = [
    `Company: ${args.companyName}`,
    `Domain:  ${args.report.source_value}`,
    "",
    "Audit data (JSON):",
    JSON.stringify(compact, null, 2),
    "",
    "Return ONLY the JSON object per the schema. Be specific to this site.",
  ].join("\n");

  const tryOnce = async (p: string) => {
    const r = await aiText({
      prompt: p,
      system: SYSTEM,
      maxTurns: 1,
      timeoutMs: 180_000,
    });
    return r ? extractJson<Omit<CompanySummary, "generated_at">>(r.text) : null;
  };

  let parsed = await tryOnce(prompt);
  if (!parsed || !parsed.tagline) {
    console.warn("[company-summary] retrying with stricter JSON-only nudge");
    parsed = await tryOnce(
      [
        prompt,
        "",
        "REMINDER: previous response did not parse as JSON.",
        "Output ONLY the raw JSON object — start with { and end with }.",
      ].join("\n"),
    );
  }
  if (!parsed) return null;
  return {
    ...parsed,
    generated_at: new Date().toISOString(),
  };
}
