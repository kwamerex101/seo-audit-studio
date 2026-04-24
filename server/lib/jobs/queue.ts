import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { dataRoot, ensureDir, writeJson, readJson } from "../storage/fs";
import { runAudit, type JobStepName } from "../runner/run-audit";
import { getOrCreateCompany } from "../storage/companies";
import { createAudit, updateAuditMeta } from "../storage/audits";

export type JobRecord = {
  id: string;
  audit_id: string;
  company_slug: string;
  source_url: string;
  step: JobStepName;
  pct: number;
  message: string;
  log: Array<{ at: string; step: JobStepName; pct: number; message: string }>;
  started_at: string;
  completed_at: string | null;
  error: string | null;
};

const jobs = new Map<string, JobRecord>();
const emitters = new Map<string, EventEmitter>();

function jobsDir(): string {
  return join(dataRoot(), "jobs");
}

function jobFile(id: string): string {
  return join(jobsDir(), `${id}.json`);
}

function getEmitter(id: string): EventEmitter {
  let e = emitters.get(id);
  if (!e) {
    e = new EventEmitter();
    e.setMaxListeners(50);
    emitters.set(id, e);
  }
  return e;
}

async function persist(record: JobRecord): Promise<void> {
  await writeJson(jobFile(record.id), record);
}

export async function getJob(id: string): Promise<JobRecord | null> {
  if (jobs.has(id)) return jobs.get(id)!;
  const fromDisk = await readJson<JobRecord>(jobFile(id));
  if (fromDisk) {
    jobs.set(id, fromDisk);
    return fromDisk;
  }
  return null;
}

export function subscribeToJob(id: string, handler: (e: JobRecord) => void) {
  const emitter = getEmitter(id);
  emitter.on("update", handler);
  return () => emitter.off("update", handler);
}

export async function createJob(args: {
  url: string;
  countries: string[];
  maxPages?: number;
}): Promise<{ jobId: string; auditId: string; companySlug: string }> {
  const parsed = new URL(args.url);
  const siteName = humanizeHost(parsed.hostname);
  const company = await getOrCreateCompany({
    name: siteName,
    domain: parsed.hostname,
  });
  const audit = await createAudit({
    companyId: company.id,
    companySlug: company.slug,
    sourceUrl: parsed.origin,
    origin: "app",
  });

  const jobId = randomUUID();
  const record: JobRecord = {
    id: jobId,
    audit_id: audit.id,
    company_slug: company.slug,
    source_url: parsed.origin,
    step: "queued",
    pct: 0,
    message: "Queued",
    log: [
      {
        at: new Date().toISOString(),
        step: "queued",
        pct: 0,
        message: "Queued",
      },
    ],
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null,
  };
  jobs.set(jobId, record);
  await ensureDir(jobsDir());
  await persist(record);

  // Run in background — don't await
  void executeJob(jobId, {
    url: args.url,
    countries: args.countries,
    maxPages: args.maxPages,
    auditId: audit.id,
  });

  return { jobId, auditId: audit.id, companySlug: company.slug };
}

async function executeJob(
  jobId: string,
  input: {
    url: string;
    countries: string[];
    maxPages?: number;
    auditId: string;
  },
): Promise<void> {
  const record = jobs.get(jobId);
  if (!record) return;
  const emitter = getEmitter(jobId);

  const updateProgress = async (
    step: JobStepName,
    pct: number,
    message: string,
  ) => {
    record.step = step;
    record.pct = pct;
    record.message = message;
    record.log.push({ at: new Date().toISOString(), step, pct, message });
    await persist(record);
    emitter.emit("update", { ...record });
  };

  try {
    await updateProgress("sitemap", 2, "Starting audit");
    await runAudit({
      url: input.url,
      countries: input.countries,
      maxPages: input.maxPages,
      auditId: input.auditId,
      onProgress: (ev) => {
        void updateProgress(ev.step, ev.pct, ev.message);
      },
    });
    record.completed_at = new Date().toISOString();
    await updateProgress("done", 100, "Audit complete");
  } catch (err) {
    record.error = err instanceof Error ? err.message : String(err);
    record.completed_at = new Date().toISOString();
    await updateProgress("failed", 100, record.error);
    await updateAuditMeta(record.company_slug, record.audit_id, {
      status: "failed",
      completed_at: record.completed_at,
    }).catch(() => {});
  }
}

function humanizeHost(host: string): string {
  const base = host
    .replace(/^www\./, "")
    .replace(/\.(com|net|org|io|dev|co|app|ai)$/i, "");
  return base
    .split(".")
    .join(" ")
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
    .trim();
}

export async function listRecentJobs(limit = 20): Promise<JobRecord[]> {
  const arr = Array.from(jobs.values());
  arr.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  return arr.slice(0, limit);
}
