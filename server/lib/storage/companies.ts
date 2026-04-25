import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { companiesFile, companyDir, readJson, writeJson } from "./fs";
import { Company } from "../report/schema";

export async function listCompanies(): Promise<Company[]> {
  const raw = await readJson<Company[]>(companiesFile());
  if (!raw) return [];
  return raw.map((c) => Company.parse(c));
}

export async function saveCompanies(companies: Company[]): Promise<void> {
  await writeJson(companiesFile(), companies);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function getOrCreateCompany(args: {
  name: string;
  domain?: string;
}): Promise<Company> {
  const slug = slugify(args.domain ?? args.name);
  const all = await listCompanies();
  const existing = all.find((c) => c.slug === slug);
  if (existing) return existing;
  const company: Company = Company.parse({
    id: randomUUID(),
    slug,
    name: args.name,
    domain: args.domain,
    created_at: new Date().toISOString(),
  });
  all.push(company);
  await saveCompanies(all);
  return company;
}

export async function findCompany(slug: string): Promise<Company | null> {
  const all = await listCompanies();
  return all.find((c) => c.slug === slug) ?? null;
}

export async function deleteCompany(slug: string): Promise<void> {
  // Remove the company entry from companies.json
  const all = await listCompanies();
  const remaining = all.filter((c) => c.slug !== slug);
  await saveCompanies(remaining);
  // Wipe its on-disk audit folder (audits, conversations, summaries, html)
  await rm(companyDir(slug), { recursive: true, force: true });
}
