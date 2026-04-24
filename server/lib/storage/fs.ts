import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function dataRoot(): string {
  const cfg = process.env.DATA_DIR;
  if (cfg && cfg.length > 0) return resolve(cfg);
  return resolve(process.cwd(), "data");
}

export async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true });
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  const text = await readFile(path, "utf8");
  if (text.trim().length === 0) return null;
  return JSON.parse(text) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function listDirs(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function auditDir(companySlug: string, auditId: string): string {
  return join(dataRoot(), "companies", companySlug, "audits", auditId);
}

export function companyDir(companySlug: string): string {
  return join(dataRoot(), "companies", companySlug);
}

export function companiesFile(): string {
  return join(dataRoot(), "companies.json");
}
