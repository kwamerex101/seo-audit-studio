import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { auditDir, companyDir, ensureDir, fileExists, listDirs, readJson, writeJson } from "./fs";
import { Audit, AuditReport } from "../report/schema";
import { listCompanies } from "./companies";

const AUDIT_META_FILE = "audit.json";
const AUDIT_REPORT_FILE = "report.json";

export async function createAudit(args: {
  companyId: string;
  companySlug: string;
  sourceUrl: string;
  origin?: "app" | "migrated";
  createdAt?: string;
  id?: string;
}): Promise<Audit> {
  const audit: Audit = Audit.parse({
    id: args.id ?? randomUUID(),
    company_id: args.companyId,
    company_slug: args.companySlug,
    source_url: args.sourceUrl,
    status: "queued",
    created_at: args.createdAt ?? new Date().toISOString(),
    origin: args.origin ?? "app",
  });
  const dir = auditDir(args.companySlug, audit.id);
  await ensureDir(dir);
  await writeJson(join(dir, AUDIT_META_FILE), audit);
  return audit;
}

export async function updateAuditMeta(
  companySlug: string,
  auditId: string,
  patch: Partial<Audit>,
): Promise<Audit> {
  const existing = await getAudit(companySlug, auditId);
  if (!existing) throw new Error(`Audit not found: ${auditId}`);
  const merged = Audit.parse({ ...existing, ...patch });
  await writeJson(join(auditDir(companySlug, auditId), AUDIT_META_FILE), merged);
  return merged;
}

export async function saveAuditReport(
  companySlug: string,
  auditId: string,
  report: AuditReport,
): Promise<void> {
  const dir = auditDir(companySlug, auditId);
  await ensureDir(dir);
  await writeJson(join(dir, AUDIT_REPORT_FILE), report);
}

export async function getAudit(
  companySlug: string,
  auditId: string,
): Promise<Audit | null> {
  const raw = await readJson<Audit>(join(auditDir(companySlug, auditId), AUDIT_META_FILE));
  if (!raw) return null;
  return Audit.parse(raw);
}

export async function getAuditReport(
  companySlug: string,
  auditId: string,
): Promise<AuditReport | null> {
  const raw = await readJson<AuditReport>(
    join(auditDir(companySlug, auditId), AUDIT_REPORT_FILE),
  );
  if (!raw) return null;
  return AuditReport.parse(raw);
}

export async function listAudits(companySlug?: string): Promise<Audit[]> {
  const companies = await listCompanies();
  const targets = companySlug
    ? companies.filter((c) => c.slug === companySlug)
    : companies;
  const results: Audit[] = [];
  for (const c of targets) {
    const auditsRoot = join(companyDir(c.slug), "audits");
    const ids = await listDirs(auditsRoot);
    for (const id of ids) {
      const audit = await getAudit(c.slug, id);
      if (audit) results.push(audit);
    }
  }
  results.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return results;
}

export async function findAuditById(auditId: string): Promise<Audit | null> {
  const companies = await listCompanies();
  for (const c of companies) {
    if (await fileExists(join(auditDir(c.slug, auditId), AUDIT_META_FILE))) {
      return getAudit(c.slug, auditId);
    }
  }
  return null;
}
