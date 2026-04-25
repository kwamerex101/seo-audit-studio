import { deleteCompany, findCompany } from "../../lib/storage/companies";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");
  if (!slug) throw createError({ statusCode: 400, message: "Missing slug" });
  const company = await findCompany(slug);
  if (!company) throw createError({ statusCode: 404, message: "Company not found" });
  await deleteCompany(slug);
  return { deleted: slug, name: company.name };
});
