import { join } from "node:path";
import { findCompany } from "../../../lib/storage/companies";
import { getAuditReport, listAudits } from "../../../lib/storage/audits";
import { companyDir, ensureDir, readJson, writeJson } from "../../../lib/storage/fs";
import {
  generateCompanySummary,
  type CompanySummary,
} from "../../../lib/ai/prompts/company-summary";

const SUMMARY_FILE = "summary.json";
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");
  if (!slug) throw createError({ statusCode: 400, message: "Missing slug" });
  const company = await findCompany(slug);
  if (!company) throw createError({ statusCode: 404, message: "Company not found" });

  const q = getQuery(event);
  const force = q.refresh === "1" || q.refresh === "true";

  const summaryPath = join(companyDir(slug), SUMMARY_FILE);
  if (!force) {
    const cached = await readJson<CompanySummary>(summaryPath);
    if (cached?.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < STALE_AFTER_MS) {
        return { company, summary: cached, cached: true };
      }
    }
  }

  // Pick the latest completed audit with a real report
  const audits = await listAudits(slug);
  const candidate = audits.find((a) => a.status === "completed") ?? audits[0];
  if (!candidate) {
    return { company, summary: null, cached: false, error: "No audits yet" };
  }
  const report = await getAuditReport(slug, candidate.id);
  if (!report) {
    return {
      company,
      summary: null,
      cached: false,
      error: "Latest audit has no report file",
    };
  }

  const summary = await generateCompanySummary({
    report,
    companyName: company.name,
  });
  if (!summary) {
    return {
      company,
      summary: null,
      cached: false,
      error:
        "AI unavailable. Start claude_local_api on :8765 or cursor-api on :7878.",
    };
  }
  summary.source_audit_id = candidate.id;
  await ensureDir(companyDir(slug));
  await writeJson(summaryPath, summary);
  return { company, summary, cached: false };
});
