import { readFile, copyFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AuditReport } from "../report/schema";
import {
  createAudit,
  getAudit,
  saveAuditReport,
  updateAuditMeta,
} from "../storage/audits";
import { getOrCreateCompany } from "../storage/companies";
import { auditDir, ensureDir } from "../storage/fs";

type Seed = {
  jsonPath: string;
  htmlPath?: string;
  companyName: string;
  domain: string;
  sourceUrl: string;
};

function legacyRoot(): string {
  return (
    process.env.LEGACY_OUTPUTS_DIR ??
    "/Users/rexdanquah/Projects/ai_agent/outputs"
  );
}

function discoverSeeds(root: string): Seed[] {
  const seeds: Seed[] = [];

  const blackmeisterJson = join(root, "blackmeisterconsulting", "seo_audit_report.json");
  if (existsSync(blackmeisterJson)) {
    seeds.push({
      jsonPath: blackmeisterJson,
      htmlPath: join(root, "blackmeisterconsulting", "seo_audit_report.html"),
      companyName: "Blackmeister Consulting",
      domain: "blackmeisterconsulting.com",
      sourceUrl: "https://www.blackmeisterconsulting.com",
    });
  }

  const sitennaJson = join(
    root,
    "sitenna",
    "2026-03-11",
    "Dev",
    "seo_audit_report.json",
  );
  if (existsSync(sitennaJson)) {
    seeds.push({
      jsonPath: sitennaJson,
      htmlPath: join(root, "sitenna", "2026-03-11", "Dev", "seo_audit_report.html"),
      companyName: "Sitenna",
      domain: "sitenna.com",
      sourceUrl: "https://sitenna.com",
    });
  }

  return seeds;
}

async function importSeed(seed: Seed): Promise<{
  slug: string;
  auditId: string;
  skipped: boolean;
}> {
  const raw = JSON.parse(await readFile(seed.jsonPath, "utf8"));
  const report = AuditReport.parse(raw);

  const company = await getOrCreateCompany({
    name: seed.companyName,
    domain: seed.domain,
  });

  const deterministicId = `migrated-${company.slug}-${report.generated_at
    .replace(/[^0-9]/g, "")
    .slice(0, 14)}`;

  const existing = await getAudit(company.slug, deterministicId);
  if (existing) {
    return { slug: company.slug, auditId: deterministicId, skipped: true };
  }

  await createAudit({
    companyId: company.id,
    companySlug: company.slug,
    sourceUrl: seed.sourceUrl,
    origin: "migrated",
    createdAt: report.generated_at,
    id: deterministicId,
  });

  await saveAuditReport(company.slug, deterministicId, report);

  if (seed.htmlPath && existsSync(seed.htmlPath)) {
    const dir = auditDir(company.slug, deterministicId);
    await ensureDir(dir);
    await copyFile(seed.htmlPath, join(dir, "report.html"));
  }

  await updateAuditMeta(company.slug, deterministicId, {
    status: "completed",
    completed_at: report.generated_at,
    site_overall_score: report.site_overall_score,
    site_seo_score: report.site_seo_score,
    site_geo_score: report.site_geo_score,
    pages_audited: report.pages_audited,
    report_path: "report.json",
  });

  return { slug: company.slug, auditId: deterministicId, skipped: false };
}

export type MigrationResult = {
  imported: number;
  skipped: number;
  details: Array<{ slug: string; audit_id: string; skipped: boolean }>;
};

export async function runMigration(): Promise<MigrationResult> {
  const root = resolve(legacyRoot());
  if (!existsSync(root)) {
    throw new Error(
      `Legacy outputs dir not found: ${root} — set LEGACY_OUTPUTS_DIR if the ai_agent repo lives elsewhere.`,
    );
  }
  const seeds = discoverSeeds(root);
  const details: MigrationResult["details"] = [];
  let imported = 0;
  let skipped = 0;
  for (const seed of seeds) {
    try {
      await stat(seed.jsonPath);
    } catch {
      continue;
    }
    const res = await importSeed(seed);
    details.push({ slug: res.slug, audit_id: res.auditId, skipped: res.skipped });
    if (res.skipped) skipped += 1;
    else imported += 1;
  }
  return { imported, skipped, details };
}
