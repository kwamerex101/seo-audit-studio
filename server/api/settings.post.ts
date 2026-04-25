import { saveSettings, type AppSettings } from "../lib/storage/settings";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Partial<AppSettings> | null;
  const settings = await saveSettings(body ?? {});
  return { settings };
});
