import { listCompanies } from "../../lib/storage/companies";

export default defineEventHandler(async () => {
  const companies = await listCompanies();
  return { companies };
});
