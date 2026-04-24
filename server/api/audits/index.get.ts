import { listAudits } from "../../lib/storage/audits";

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const company = typeof q.company === "string" ? q.company : undefined;
  const audits = await listAudits(company);
  return { audits };
});
