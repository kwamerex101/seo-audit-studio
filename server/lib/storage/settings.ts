import { join } from "node:path";
import { dataRoot, readJson, writeJson } from "./fs";

export type AiProvider = "osaurus" | "claude_cli" | "cursor";

export type ClaudeCliModel = "sonnet" | "opus" | "haiku" | "default";

export type AppSettings = {
  ai_provider_order: AiProvider[];
  ai_provider_enabled: Record<AiProvider, boolean>;
  claude_cli_model: ClaudeCliModel;
};

const ALL_PROVIDERS: AiProvider[] = ["osaurus", "claude_cli", "cursor"];

const DEFAULTS: AppSettings = {
  ai_provider_order: ["osaurus", "claude_cli", "cursor"],
  ai_provider_enabled: { osaurus: true, claude_cli: true, cursor: true },
  claude_cli_model: "sonnet",
};

function settingsFile(): string {
  return join(dataRoot(), "settings.json");
}

function normalize(input: Partial<AppSettings> | null): AppSettings {
  if (!input) {
    return {
      ...DEFAULTS,
      ai_provider_enabled: { ...DEFAULTS.ai_provider_enabled },
      ai_provider_order: [...DEFAULTS.ai_provider_order],
    };
  }
  const seen = new Set<AiProvider>();
  const order: AiProvider[] = [];
  for (const p of input.ai_provider_order ?? []) {
    if (ALL_PROVIDERS.includes(p) && !seen.has(p)) {
      order.push(p);
      seen.add(p);
    }
  }
  for (const p of ALL_PROVIDERS) {
    if (!seen.has(p)) order.push(p);
  }
  // Strip legacy "claude" entries from persisted settings.
  const rawEnabled = { ...(input.ai_provider_enabled ?? {}) } as Record<string, boolean>;
  delete rawEnabled.claude;
  const enabled = {
    ...DEFAULTS.ai_provider_enabled,
    ...(rawEnabled as Partial<Record<AiProvider, boolean>>),
  };
  const validModels: ClaudeCliModel[] = ["sonnet", "opus", "haiku", "default"];
  const model = validModels.includes(input.claude_cli_model as ClaudeCliModel)
    ? (input.claude_cli_model as ClaudeCliModel)
    : DEFAULTS.claude_cli_model;
  return { ai_provider_order: order, ai_provider_enabled: enabled, claude_cli_model: model };
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
