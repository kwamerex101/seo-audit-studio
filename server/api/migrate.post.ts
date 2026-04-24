import { runMigration } from "../lib/migrate/import-outputs";

export default defineEventHandler(async () => {
  const result = await runMigration();
  return result;
});
