import { createJob } from "../../lib/jobs/queue";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const url = String(body?.url ?? "").trim();
  const maxPagesRaw = body?.max_pages;
  // 0 / undefined / null → uncapped sitemap (crawl every URL the sitemap lists)
  const maxPages =
    maxPagesRaw === undefined || maxPagesRaw === null || maxPagesRaw === 0
      ? undefined
      : Math.max(1, Number(maxPagesRaw));
  const countriesRaw = body?.countries;
  const countries = Array.isArray(countriesRaw)
    ? countriesRaw.map((c: unknown) => String(c).toUpperCase().trim()).filter(Boolean)
    : typeof countriesRaw === "string"
      ? countriesRaw
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      : [];

  if (!url) throw createError({ statusCode: 400, message: "Missing url" });
  try {
    new URL(url);
  } catch {
    throw createError({ statusCode: 400, message: `Invalid URL: ${url}` });
  }

  const { jobId, auditId, companySlug } = await createJob({
    url,
    countries,
    maxPages,
  });

  return {
    job_id: jobId,
    audit_id: auditId,
    company_slug: companySlug,
  };
});
