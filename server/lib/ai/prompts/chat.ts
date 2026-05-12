import { claudeStream, isClaudeAvailable } from "../client";
import type { AuditReport } from "../../report/schema";

const SYSTEM = `You are an SEO + GEO advisor embedded in an audit viewer.

You answer questions about a specific audit report. You can recommend keywords, explain scores, suggest Yoast/meta copy, compare pages, prioritize TO-DO items, and flag risks.

Rules:
- Ground every answer in the audit data. If the user asks about something the report doesn't cover, say so and suggest what to crawl or re-audit to get the answer.
- When you reference a page, include its URL. When you reference a TO-DO item, include its ID (e.g. T-03).
- Keep responses tight. Use short paragraphs and bullet lists. No filler preamble like "Great question!".
- No markdown tables — use bullets instead.`;

function renderReportContext(report: AuditReport): string {
  const pages = report.pages.slice(0, 25).map((p) => ({
    url: p.url,
    type: p.type,
    title: p.title,
    h1: p.h1,
    meta_description: p.meta_description,
    meta_description_length: p.meta_description_length,
    title_length: p.title_length,
    json_ld_types: p.json_ld_types,
    issues: p.issues?.slice(0, 6),
    score: p.score,
    technical: p.technical,
    on_page: p.on_page,
    content: p.content,
    links: p.links,
    schema: p.schema,
    geo: p.geo,
  }));
  const summary = {
    site_name: report.site_name,
    source_value: report.source_value,
    generated_at: report.generated_at,
    site_overall_score: report.site_overall_score,
    site_seo_score: report.site_seo_score,
    site_geo_score: report.site_geo_score,
    site_category_averages: report.site_category_averages,
    countries: report.countries,
    trinity_review: report.trinity_review,
    skill_based_summary: report.skill_based_summary,
    keyword_tiers: report.keyword_tiers,
    competitors: report.competitors,
    geo_readiness: report.geo_readiness,
    top_actions: report.top_actions,
    todo_list: report.todo_list.slice(0, 30),
    implementation_plan: report.implementation_plan?.slice(0, 20),
    pages,
  };
  return `# Audit report context\n\n${JSON.stringify(summary, null, 2)}`;
}

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export async function streamChatReply(args: {
  report: AuditReport;
  history: ChatTurn[];
  extraContext?: string;
  onDelta: (text: string) => void;
}): Promise<string> {
  if (!(await isClaudeAvailable())) {
    const msg =
      "No AI provider reachable. Start Osaurus on :1337, ensure the `claude` CLI is on PATH and logged in, or start cursor-api on :7878. Configure provider order in Settings.";
    args.onDelta(msg);
    return msg;
  }

  const system = args.extraContext?.trim()
    ? `${SYSTEM}\n\n# Additional context about this site\n\n${args.extraContext.trim()}`
    : SYSTEM;

  const reportContext = renderReportContext(args.report);
  const conversation = args.history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const prompt = [
    reportContext,
    "",
    "# Conversation so far",
    "",
    conversation,
    "",
    "Reply as Assistant. Do not prefix your reply with 'Assistant:'.",
  ].join("\n");

  let full = "";
  try {
    for await (const chunk of claudeStream({
      prompt,
      system,
      maxTurns: 1,
      timeoutMs: 180_000,
    })) {
      full += chunk;
      args.onDelta(chunk);
    }
  } catch (err) {
    const msg = `Error from Claude: ${err instanceof Error ? err.message : String(err)}`;
    args.onDelta(msg);
    return msg;
  }
  return full;
}
