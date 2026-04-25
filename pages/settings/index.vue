<script setup lang="ts">
type AiProvider = "osaurus" | "claude" | "cursor";
type AppSettings = {
  ai_provider_order: AiProvider[];
  ai_provider_enabled: Record<AiProvider, boolean>;
};

const PROVIDER_META: Record<
  AiProvider,
  { name: string; description: string; defaultUrl: string; envHint: string }
> = {
  osaurus: {
    name: "Osaurus",
    description: "Local OpenAI-compatible inference. Fastest, no cloud calls.",
    defaultUrl: "http://127.0.0.1:1337",
    envHint: "OSAURUS_API_URL · OSAURUS_API_KEY · OSAURUS_MODEL",
  },
  claude: {
    name: "claude_local_api",
    description: "Wraps the Claude Code CLI subscription. High quality, no per-call cost.",
    defaultUrl: "http://localhost:8765",
    envHint: "CLAUDE_LOCAL_API_URL · CLAUDE_LOCAL_PROVIDER",
  },
  cursor: {
    name: "cursor-api",
    description: "OpenAI-compatible proxy over the Cursor Agent CLI.",
    defaultUrl: "http://localhost:7878",
    envHint: "CURSOR_API_URL · CURSOR_API_TOKEN · CURSOR_API_MODEL",
  },
};

const { data, refresh } = await useFetch<{ settings: AppSettings }>("/api/settings");
const settings = ref<AppSettings>(
  data.value?.settings ?? {
    ai_provider_order: ["osaurus", "claude", "cursor"],
    ai_provider_enabled: { osaurus: true, claude: true, cursor: true },
  },
);

const saving = ref(false);
const saveMessage = ref<string | null>(null);
const saveError = ref<string | null>(null);

function moveUp(idx: number) {
  if (idx <= 0) return;
  const next = [...settings.value.ai_provider_order];
  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  settings.value = { ...settings.value, ai_provider_order: next };
}
function moveDown(idx: number) {
  const arr = settings.value.ai_provider_order;
  if (idx >= arr.length - 1) return;
  const next = [...arr];
  [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
  settings.value = { ...settings.value, ai_provider_order: next };
}
function toggleEnabled(p: AiProvider) {
  settings.value = {
    ...settings.value,
    ai_provider_enabled: {
      ...settings.value.ai_provider_enabled,
      [p]: !settings.value.ai_provider_enabled[p],
    },
  };
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  saveError.value = null;
  saveMessage.value = null;
  try {
    const res = await $fetch<{ settings: AppSettings }>("/api/settings", {
      method: "POST",
      body: settings.value,
    });
    settings.value = res.settings;
    saveMessage.value = "Settings saved.";
    await refresh();
    setTimeout(() => (saveMessage.value = null), 3000);
  } catch (err: any) {
    saveError.value = err?.data?.message ?? err?.message ?? "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function resetDefaults() {
  settings.value = {
    ai_provider_order: ["osaurus", "claude", "cursor"],
    ai_provider_enabled: { osaurus: true, claude: true, cursor: true },
  };
  await save();
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-2xl font-bold">Settings</h1>
      <p class="text-mute">Configure AI provider order and learn how the app works.</p>
    </div>

    <!-- AI Provider Order -->
    <section class="card mb-6">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">AI provider order</h2>
          <p class="mt-1 text-sm text-mute">
            Audits try providers from top to bottom. The first one that responds wins; on failure or timeout the next one is tried automatically.
          </p>
        </div>
      </div>

      <ol class="space-y-3">
        <li
          v-for="(p, i) in settings.ai_provider_order"
          :key="p"
          class="flex items-center gap-3 rounded-lg border border-border bg-surface2/40 px-4 py-3"
        >
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
            {{ i + 1 }}
          </span>
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-semibold">{{ PROVIDER_META[p].name }}</span>
              <span
                v-if="!settings.ai_provider_enabled[p]"
                class="rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bad"
              >
                Disabled
              </span>
            </div>
            <div class="text-xs text-mute">{{ PROVIDER_META[p].description }}</div>
            <div class="mt-0.5 text-[11px] font-mono text-mute/80">
              {{ PROVIDER_META[p].defaultUrl }} · env: {{ PROVIDER_META[p].envHint }}
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="i === 0"
              title="Move up"
              @click="moveUp(i)"
            >
              ↑
            </button>
            <button
              class="rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="i === settings.ai_provider_order.length - 1"
              title="Move down"
              @click="moveDown(i)"
            >
              ↓
            </button>
            <button
              class="rounded-md border px-2 py-1 text-xs"
              :class="
                settings.ai_provider_enabled[p]
                  ? 'border-good/40 bg-good/10 text-good hover:bg-good/20'
                  : 'border-border bg-surface text-mute hover:bg-surface2'
              "
              @click="toggleEnabled(p)"
            >
              {{ settings.ai_provider_enabled[p] ? "Enabled" : "Disabled" }}
            </button>
          </div>
        </li>
      </ol>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <button
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90 disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? "Saving…" : "Save changes" }}
        </button>
        <button
          class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface2"
          :disabled="saving"
          @click="resetDefaults"
        >
          Reset to defaults
        </button>
        <span v-if="saveMessage" class="text-sm text-good">{{ saveMessage }}</span>
        <span v-if="saveError" class="text-sm text-bad">{{ saveError }}</span>
      </div>
    </section>

    <!-- SEO checklist link -->
    <NuxtLink
      to="/settings/checklist"
      class="card mb-6 flex items-center justify-between gap-4 transition-colors hover:border-accent/50 hover:bg-surface2/60"
    >
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold">SEO checklist</h2>
          <p class="mt-1 text-sm text-mute">
            Browse all 38 signals every audit scores — technical, on-page, content, links, schema, GEO. See which are deterministic rules vs. AI-evaluated.
          </p>
        </div>
      </div>
      <span class="text-mute">→</span>
    </NuxtLink>

    <!-- FAQ -->
    <section class="card">
      <h2 class="mb-4 text-lg font-semibold">FAQ &amp; setup</h2>
      <div class="space-y-3">
        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            What does this app do?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            SEO Audit Studio crawls a website, scores each page on technical, on-page, content, links, schema, and GEO/AI-readiness signals using a deterministic rules engine, then enhances the scores with AI commentary (Trinity Review for SEO/GEO/UX, top recommendations, competitive analysis, priority roadmap). All data is stored locally on your machine.
          </div>
        </details>

        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            What do I need to run it?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            <ul class="ml-5 list-disc space-y-1">
              <li>Node 20+ and pnpm.</li>
              <li>An AI provider running locally — at least one of:
                <ul class="ml-5 mt-1 list-disc">
                  <li><span class="font-mono">Osaurus</span> on <span class="font-mono">127.0.0.1:1337</span> (recommended, fully local)</li>
                  <li><span class="font-mono">claude_local_api</span> on <span class="font-mono">localhost:8765</span> (Claude Code CLI)</li>
                  <li><span class="font-mono">cursor-api</span> on <span class="font-mono">localhost:7878</span> (Cursor Agent CLI)</li>
                </ul>
              </li>
              <li>Network access for the crawler to fetch the audited site.</li>
            </ul>
          </div>
        </details>

        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            How do I start the app?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            <pre class="my-2 rounded-md bg-bg/50 px-3 py-2 font-mono text-xs">pnpm install
pnpm dev</pre>
            Then open <span class="font-mono">http://localhost:3000</span>. Click <span class="text-text">New audit</span>, paste a URL, hit Start.
          </div>
        </details>

        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            How do I configure providers (URLs, keys, models)?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            Edit the <span class="font-mono">.env</span> file at the repo root. Available variables:
            <pre class="my-2 rounded-md bg-bg/50 px-3 py-2 font-mono text-[11px] leading-relaxed overflow-x-auto">OSAURUS_API_URL=http://127.0.0.1:1337
OSAURUS_API_KEY=osk-v1...
OSAURUS_MODEL=gemma-4-e2b-it-8bit

CLAUDE_LOCAL_API_URL=http://localhost:8765
CLAUDE_LOCAL_PROVIDER=subprocess

CURSOR_API_URL=http://localhost:7878
CURSOR_API_TOKEN=...
CURSOR_API_MODEL=auto</pre>
            Restart <span class="font-mono">pnpm dev</span> after changing <span class="font-mono">.env</span>. Provider <em>order</em> can be changed live above without a restart.
          </div>
        </details>

        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            What happens if my AI provider fails mid-audit?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            Each AI call gets up to 2 retries with exponential backoff (3s, 9s) before falling through to the next provider in the order above. If all providers fail for a page, the audit completes with deterministic-only scoring and the failed URLs are tracked in <span class="font-mono">ai_failed_urls</span>. You can retry just the failed pages from the audit page.
          </div>
        </details>

        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            Can I run multiple audits at the same time?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            Yes — jobs run independently. The crawl/scoring stages parallelize cleanly. AI calls hit the same provider, so if you're using local inference (Osaurus, claude_local_api), expect the AI portion to serialize at the model level — running 2 audits is roughly 2× slower for the AI step than running them sequentially.
          </div>
        </details>

        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            Where is my data stored?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            All audits, reports, jobs, and chat history live under <span class="font-mono">./data/</span> at the repo root (or whatever <span class="font-mono">DATA_DIR</span> is set to). Nothing leaves your machine unless your AI provider is a remote service.
          </div>
        </details>

        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            What's the difference between Full Report and Executive Report?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            <span class="text-text">Full Report</span> shows every section: per-page table, schema details, todo list, AI chat panel — built for analysts. <span class="text-text">Executive Report</span> is a stakeholder-friendly summary: scores, Trinity narratives, top recommendations, GEO readiness, priority roadmap. Both download as PDF (via the browser's "Save as PDF" print dialog).
          </div>
        </details>

        <details class="group rounded-lg border border-border bg-surface2/40 px-4 py-3">
          <summary class="cursor-pointer font-medium">
            A job is stuck on "Stopping…" — how do I kill it?
          </summary>
          <div class="mt-2 text-sm text-mute leading-relaxed">
            After 15 seconds in the "Stopping…" state, a <span class="text-text">Force stop</span> button appears next to the Stop button. It writes the job to <span class="font-mono">failed</span> directly, bypasses the runner, and the dashboard reflects the final state immediately.
          </div>
        </details>
      </div>
    </section>
  </div>
</template>
