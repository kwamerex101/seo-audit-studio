import { findCompany } from "../../lib/storage/companies";
import { listAudits } from "../../lib/storage/audits";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");
  if (!slug) throw createError({ statusCode: 400, message: "Missing slug" });
  const company = await findCompany(slug);
  if (!company) throw createError({ statusCode: 404, message: "Company not found" });
  const audits = await listAudits(slug);
  return { company, audits };
});
