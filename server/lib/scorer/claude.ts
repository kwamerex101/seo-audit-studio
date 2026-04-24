import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PageSignals, SiteSignals } from "../crawler/types";
import type { PageScoreResult } from "./deterministic";
import {
  scorePageWithClaude,
  type ClaudeScoreResult,
} from "../ai/prompts/scoring";

type ChecklistItem = {
  id: string;
  category: string;
  type: string;
  weight?: number;
  scoring_mode?: string;
};

let cachedItems: Map<string, ChecklistItem> | null = null;

async function getChecklistItemsById(): Promise<Map<string, ChecklistItem>> {
  if (cachedItems) return cachedItems;
  const raw = await readFile(join(process.cwd(), "checklist.json"), "utf8");
  const parsed = JSON.parse(raw) as { items: ChecklistItem[] };
  cachedItems = new Map(parsed.items.map((i) => [i.id, i]));
  return cachedItems;
}

export type ClaudeEnhancedScore = {
  score: PageScoreResult["score"];
  claude_item_results: Record<
    string,
    { score: number; max_score: number; reasoning: string }
  >;
};

export async function enhancePageWithClaude(args: {
  page: PageSignals;
  site: SiteSignals;
  deterministic: PageScoreResult;
}): Promise<ClaudeEnhancedScore> {
  const { page, site, deterministic } = args;

  const items = deterministic.score.pending_ai_items;
  if (items.length === 0) {
    return { score: deterministic.score, claude_item_results: {} };
  }

  let result: ClaudeScoreResult | null = null;
  try {
    result = await scorePageWithClaude({
      page,
      site,
      itemsToScore: items,
    });
  } catch (err) {
    console.warn("[claude] scoring failed:", err);
    return { score: deterministic.score, claude_item_results: {} };
  }
  if (!result) return { score: deterministic.score, claude_item_results: {} };

  const byId = await getChecklistItemsById();

  const deductions: Record<string, number> = {
    technical: 0,
    on_page: 0,
    content: 0,
    links: 0,
    schema: 0,
    geo: 0,
  };

  for (const [itemId, claudeScore] of Object.entries(result.items)) {
    const def = byId.get(itemId);
    if (!def) continue;
    if (def.category === "geo") {
      const awarded = Math.max(0, Math.min(25, Number(claudeScore.score) || 0));
      const missed = 25 - awarded;
      deductions.geo += missed;
    } else {
      const awarded = Math.max(0, Math.min(10, Number(claudeScore.score) || 0));
      const missed = 10 - awarded;
      const weight = def.weight ?? 1;
      deductions[def.category] =
        (deductions[def.category] ?? 0) + missed * weight;
    }
  }

  const startTech = deterministic.score.technical;
  const startOn = deterministic.score.on_page;
  const startContent = deterministic.score.content;
  const startLinks = deterministic.score.links;
  const startSchema = deterministic.score.schema;
  const startGeo = deterministic.score.geo;

  const technical = Math.max(0, startTech - deductions.technical);
  const on_page = Math.max(0, startOn - deductions.on_page);
  const content = Math.max(0, startContent - deductions.content);
  const links = Math.max(0, startLinks - deductions.links);
  const schema = Math.max(0, startSchema - deductions.schema);
  const geo = Math.max(0, startGeo - deductions.geo);

  const seo = (technical + on_page + content + links + schema) / 5;
  const overall = seo * 0.6 + geo * 0.4;

  return {
    score: {
      technical: Math.round(technical),
      on_page: Math.round(on_page),
      content: Math.round(content),
      links: Math.round(links),
      schema: Math.round(schema),
      geo: Math.round(geo),
      overall: Math.round(overall),
      pending_ai_items: [],
    },
    claude_item_results: result.items,
  };
}
