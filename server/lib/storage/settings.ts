import { join } from "node:path";
import { dataRoot, readJson, writeJson } from "./fs";

export type AiProvider = "osaurus" | "claude" | "cursor";

export type AppSettings = {
  ai_provider_order: AiProvider[];
  ai_provider_enabled: Record<AiProvider, boolean>;
};

const DEFAULTS: AppSettings = {
  ai_provider_order: ["osaurus", "claude", "cursor"],
  ai_provider_enabled: { osaurus: true, claude: true, cursor: true },
};

function settingsFile(): string {
  return join(dataRoot(), "settings.json");
}

function normalize(input: Partial<AppSettings> | null): AppSettings {
  if (!input) return { ...DEFAULTS, ai_provider_enabled: { ...DEFAULTS.ai_provider_enabled } };
  const all: AiProvider[] = ["osaurus", "claude", "cursor"];
  const seen = new Set<AiProvider>();
  const order: AiProvider[] = [];
  for (const p of input.ai_provider_order ?? []) {
    if (all.includes(p) && !seen.has(p)) {
      order.push(p);
      seen.add(p);
    }
  }
  for (const p of all) {
    if (!seen.has(p)) order.push(p);
  }
  const enabled = { ...DEFAULTS.ai_provider_enabled, ...(input.ai_provider_enabled ?? {}) };
  return { ai_provider_order: order, ai_provider_enabled: enabled };
}

export async function getSettings(): Promise<AppSettings> {
  const raw = await readJson<Partial<AppSettings>>(settingsFile());
  return normalize(raw);
}

export async function saveSettings(input: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const merged = normalize({ ...current, ...input });
  await writeJson(settingsFile(), merged);
  return merged;
}
