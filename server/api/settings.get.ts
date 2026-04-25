import { getSettings } from "../lib/storage/settings";

export default defineEventHandler(async () => {
  const settings = await getSettings();
  return { settings };
});
