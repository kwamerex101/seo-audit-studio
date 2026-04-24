import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeText, extractJson, isClaudeAvailable } from "../client";
import type { PageSignals, SiteSignals } from "../../crawler/types";

type ChecklistItem = {
  id: string;
  category: string;
  title: string;
  description?: string;
  type: string;
  weight?: number;
  penalty?: number;
  scoring_mode?: string;
  how_to_evaluate?: string;
};

type Checklist = {
  items: ChecklistItem[];
};

let cachedChecklist: Checklist | null = null;

async function loadChecklist(): Promise<Checklist> {
  if (cachedChecklist) return cachedChecklist;
  const path = join(process.cwd(), "checklist.json");
  const raw = await readFile(path, "utf8");
  cachedChecklist = JSON.parse(raw) as Checklist;
  return cachedChecklist;
}

export type ClaudeItemScore = {
  score: number;
  max_score: number;
  reasoning: string;
};

export type ClaudeScoreResult = {
  items: Record<string, ClaudeItemScore>;
};

const SYSTEM_ROLE = `You are an expert SEO + GEO (Generative Engine Optimization) auditor.

You evaluate individual webpages against a standardized checklist of SEO and GEO quality signals. Your output is ALWAYS a single JSON object — no prose before or after, no markdown fences, no commentary.

Rules:
- Evaluate every requested checklist item. Never skip.
- Base scores strictly on the evidence in the provided page signals.
- For GEO items the max_score is 25 (quartile-scored). For all others, max_score is 10 (scaled 0–10).
- Reasoning: 1–2 short sentences referencing actual fields ("title is 85 chars, exceeds 60").
- Never invent schema types, keywords, or competitors that aren't in the signals.

Output schema:
{
  "items": {
    "<checklist_item_id>": {
      "score": <number>,
      "max_score": <number>,
      "reasoning": "<string>"
    }
  }
}`;

function buildChecklistReference(items: ChecklistItem[]): string {
  const lines: string[] = [
    "Reference: checklist items you may be asked to evaluate.",
    "",
  ];
  for (const item of items) {
    if (item.scoring_mode !== "claude" && item.scoring_mode !== "hybrid") {
      continue;
    }
    const max = item.category === "geo" ? 25 : 10;
    lines.push(
      `- ${item.id} [${item.category}] (max ${max}) — ${item.title}`,
    );
    if (item.description) lines.push(`    desc: ${item.description}`);
    if (item.how_to_evaluate) lines.push(`    how: ${item.how_to_evaluate}`);
  }
  return lines.join("\n");
}

function buildPagePrompt(args: {
  page: PageSignals;
  site: SiteSignals;
  itemsToScore: string[];
  reference: string;
}): string {
  const { page, site, itemsToScore, reference } = args;
  const signals = {
    url: page.url,
    title: page.title,
    title_length: page.title_length,
    meta_description: page.meta_description,
    meta_description_length: page.meta_description_length,
    h1: page.h1,
    has_h1: page.has_h1,
    headings_sample: page.headings.slice(0, 12),
    heading_hierarchy_clean: page.heading_hierarchy_clean,
    images: { total: page.images_total, missing_alt: page.images_missing_alt },
    json_ld_types: page.json_ld_types,
    organization_schema: page.organization_schema,
    canonical: page.canonical,
    og_tags: page.og_tags,
    twitter_card: page.twitter_card,
    viewport: page.viewport,
    charset_utf8: page.charset_utf8,
    lang: page.lang,
    hreflang: page.hreflang,
    https: page.https,
    faq_section: page.faq_section,
    word_count: page.word_count,
    internal_link_count: page.internal_links.length,
    external_link_count: page.external_links.length,
    anchor_generic_count: page.internal_anchor_generic_count,
    page_type_guess: page.page_type_guess,
    first_200_words: page.first_200_words,
    site_llms_txt: site.llms_txt,
    site_has_sitemap: site.sitemap.present && site.sitemap.valid,
  };

  return [
    reference,
    "",
    `Items to score: ${itemsToScore.join(", ")}`,
    "",
    "Page signals (JSON):",
    JSON.stringify(signals, null, 2),
    "",
    "Return ONLY the JSON object. No prose, no markdown fences.",
  ].join("\n");
}

export async function scorePageWithClaude(args: {
  page: PageSignals;
  site: SiteSignals;
  itemsToScore: string[];
}): Promise<ClaudeScoreResult | null> {
  if (args.itemsToScore.length === 0) return { items: {} };
  if (!(await isClaudeAvailable())) return null;

  const checklist = await loadChecklist();
  const reference = buildChecklistReference(checklist.items);
  const prompt = buildPagePrompt({
    page: args.page,
    site: args.site,
    itemsToScore: args.itemsToScore,
    reference,
  });

  const text = await claudeText({
    prompt,
    system: SYSTEM_ROLE,
    maxTurns: 1,
    timeoutMs: 90_000,
  });

  const parsed = extractJson<ClaudeScoreResult>(text);
  if (!parsed || !parsed.items) return { items: {} };
  return parsed;
}
