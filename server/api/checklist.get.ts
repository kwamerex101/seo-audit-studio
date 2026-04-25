import { readFile } from "node:fs/promises";
import { join } from "node:path";

export default defineEventHandler(async () => {
  const path = join(process.cwd(), "checklist.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
});
