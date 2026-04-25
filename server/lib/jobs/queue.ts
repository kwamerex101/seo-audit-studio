import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { dataRoot, ensureDir, writeJson, readJson } from "../storage/fs";
import { runAudit, type JobStepName } from "../runner/run-audit";
import { rescoreAudit } from "../runner/rescore-audit";
import { getOrCreateCompany } from "../storage/companies";
import { createAudit, findAuditById, updateAuditMeta } from "../storage/audits";

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
  cancelled?: boolean;
};

const jobs = new Map<string, JobRecord>();
const emitters = new Map<string, EventEmitter>();
const cancelFlags = new Map<string, boolean>();

export function isJobCancelled(jobId: string): boolean {
  return cancelFlags.get(jobId) === true;
}


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

/**
 * Mark a job as cancelled. The runner checks this flag at safe points and
 * stops cleanly. Also marks the corresponding audit as failed so it shows up
 * as "cancelled" in the dashboard.
 */
export async function cancelJob(jobId: string): Promise<JobRecord | null> {
  const record = jobs.get(jobId) ?? (await getJob(jobId));
  if (!record) return null;
  if (record.step === "done" || record.step === "failed") return record;
  cancelFlags.set(jobId, true);
  record.cancelled = true;
  record.message = "Cancellation requested…";
  record.log.push({
    at: new Date().toISOString(),
    step: record.step,
    pct: record.pct,
    message: "Cancellation requested by user",
  });
  await persist(record);
  getEmitter(jobId).emit("update", { ...record });
  return record;
}

/**
 * Force-terminate a job immediately by writing step="failed" directly to the
 * record and emitting the SSE event. Used when the runner is hung and
 * cancelJob's flag is never read. The background process may still be running
 * but the UI will treat the job as finished.
 */
export async function forceTerminateJob(jobId: string): Promise<JobRecord | null> {
  const record = jobs.get(jobId) ?? (await getJob(jobId));
  if (!record) return null;
  if (record.step === "done" || record.step === "failed") return record;
  cancelFlags.set(jobId, true);
  record.cancelled = true;
  record.step = "failed";
  record.error = "Force stopped — job was not responding";
  record.message = "Force stopped — job was not responding";
  record.completed_at = new Date().toISOString();
  record.log.push({
    at: record.completed_at,
    step: "failed",
    pct: record.pct,
    message: record.error,
  });
  await persist(record);
  getEmitter(jobId).emit("update", { ...record });
  // The runner may be hung and never reach its own catch block, so we must
  // update the audit meta here directly — otherwise it stays "running" forever.
  await updateAuditMeta(record.company_slug, record.audit_id, {
    status: "failed",
    completed_at: record.completed_at,
  }).catch(() => {});
  return record;
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
      isCancelled: () => isJobCancelled(jobId),
      onProgress: (ev) => {
        void updateProgress(ev.step, ev.pct, ev.message);
      },
    });
    record.completed_at = new Date().toISOString();
    await updateProgress("done", 100, "Audit complete");
  } catch (err) {
    const cancelled =
      err instanceof Error && err.name === "JobCancelledError";
    record.error = cancelled
      ? "Cancelled by user"
      : err instanceof Error
        ? err.message
        : String(err);
    record.cancelled = cancelled || record.cancelled;
    record.completed_at = new Date().toISOString();
    await updateProgress("failed", 100, record.error);
    await updateAuditMeta(record.company_slug, record.audit_id, {
      status: "failed",
      completed_at: record.completed_at,
    }).catch(() => {});
  } finally {
    cancelFlags.delete(jobId);
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

export async function createRescoreJob(args: {
  auditId: string;
  /** When set, only these URLs get AI-rescored. Used for "retry failed pages". */
  onlyUrls?: string[];
}): Promise<{ jobId: string; auditId: string; companySlug: string }> {
  const audit = await findAuditById(args.auditId);
  if (!audit) throw new Error(`Audit not found: ${args.auditId}`);

  const jobId = randomUUID();
  const target = args.onlyUrls?.length;
  const initialMsg = target
    ? `Queued — retrying AI on ${target} failed page(s)`
    : "Queued — re-running AI checks";
  const record: JobRecord = {
    id: jobId,
    audit_id: audit.id,
    company_slug: audit.company_slug,
    source_url: audit.source_url,
    step: "queued",
    pct: 0,
    message: initialMsg,
    log: [
      {
        at: new Date().toISOString(),
        step: "queued",
        pct: 0,
        message: initialMsg,
      },
    ],
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null,
  };
  jobs.set(jobId, record);
  await ensureDir(jobsDir());
  await persist(record);

  void executeRescoreJob(jobId, audit.id, args.onlyUrls);

  return { jobId, auditId: audit.id, companySlug: audit.company_slug };
}

async function executeRescoreJob(
  jobId: string,
  auditId: string,
  onlyUrls?: string[],
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
    await rescoreAudit({
      auditId,
      onlyUrls,
      isCancelled: () => isJobCancelled(jobId),
      onProgress: (ev) => {
        void updateProgress(ev.step, ev.pct, ev.message);
      },
    });
    record.completed_at = new Date().toISOString();
    await updateProgress("done", 100, "Rescore complete");
  } catch (err) {
    const cancelled =
      err instanceof Error && err.name === "JobCancelledError";
    record.error = cancelled
      ? "Cancelled by user"
      : err instanceof Error
        ? err.message
        : String(err);
    record.cancelled = cancelled || record.cancelled;
    record.completed_at = new Date().toISOString();
    await updateProgress("failed", 100, record.error);
  } finally {
    cancelFlags.delete(jobId);
  }
}

export async function listRecentJobs(limit = 20): Promise<JobRecord[]> {
  const arr = Array.from(jobs.values());
  arr.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  return arr.slice(0, limit);
}

/**
 * Finds the most recent job for an audit. Prefers a still-running job; if
 * none, returns the latest finished one. Used by the audit page so users can
 * navigate away and back and still see live progress.
 */
export async function findJobForAudit(
  auditId: string,
): Promise<JobRecord | null> {
  // In-memory pass first (fastest, includes anything currently running)
  const all = Array.from(jobs.values()).filter((j) => j.audit_id === auditId);
  // Prefer running, then most recent
  all.sort((a, b) => {
    const aRunning = a.step !== "done" && a.step !== "failed";
    const bRunning = b.step !== "done" && b.step !== "failed";
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    return a.started_at < b.started_at ? 1 : -1;
  });
  if (all.length > 0) return all[0];

  // Fallback: scan disk
  try {
    const dir = jobsDir();
    if (!existsSync(dir)) return null;
    const entries = await readdir(dir);
    let latest: JobRecord | null = null;
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      const rec = await readJson<JobRecord>(join(dir, name));
      if (!rec || rec.audit_id !== auditId) continue;
      if (
        !latest ||
        (rec.started_at && rec.started_at > (latest.started_at ?? ""))
      ) {
        latest = rec;
      }
    }
    return latest;
  } catch {
    return null;
  }
}
