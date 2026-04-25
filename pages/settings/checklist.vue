<script setup lang="ts">
type Category =
  | "technical"
  | "on_page"
  | "content"
  | "links"
  | "schema"
  | "geo";

type ChecklistItem = {
  id: string;
  category: Category;
  title: string;
  description: string;
  type: "binary" | "scaled" | "geo_quartile";
  scoring_mode: "deterministic" | "claude" | "hybrid";
  penalty?: number;
  max_total_penalty?: number;
  weight?: number;
  how_to_evaluate?: string;
};

type Checklist = {
  version: string;
  source: string;
  categories: Record<Category, { label: string; base: number }>;
  items: ChecklistItem[];
};

const { data } = await useFetch<Checklist>("/api/checklist");

const search = ref("");
const activeCategory = ref<Category | "all">("all");
const activeMode = ref<"all" | "deterministic" | "claude" | "hybrid">("all");

const items = computed(() => data.value?.items ?? []);
const categories = computed(() => data.value?.categories ?? ({} as Checklist["categories"]));

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return items.value.filter((it) => {
    if (activeCategory.value !== "all" && it.category !== activeCategory.value) return false;
    if (activeMode.value !== "all" && it.scoring_mode !== activeMode.value) return false;
    if (!q) return true;
    return (
      it.title.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.id.toLowerCase().includes(q) ||
      (it.how_to_evaluate ?? "").toLowerCase().includes(q)
    );
  });
});

const grouped = computed(() => {
  const map = new Map<Category, ChecklistItem[]>();
  for (const it of filtered.value) {
    const list = map.get(it.category) ?? [];
    list.push(it);
    map.set(it.category, list);
  }
  return map;
});

const categoryOrder: Category[] = ["technical", "on_page", "content", "links", "schema", "geo"];

function categoryCount(cat: Category): number {
  return items.value.filter((it) => it.category === cat).length;
}

function modeBadgeClass(mode: ChecklistItem["scoring_mode"]): string {
  switch (mode) {
    case "deterministic":
      return "bg-good/15 text-good border-good/30";
    case "claude":
      return "bg-accent/15 text-accent border-accent/30";
    case "hybrid":
      return "bg-warn/15 text-warn border-warn/30";
  }
}

function modeLabel(mode: ChecklistItem["scoring_mode"]): string {
  switch (mode) {
    case "deterministic":
      return "Rules";
    case "claude":
      return "AI";
    case "hybrid":
      return "Rules + AI";
  }
}

function impactLabel(it: ChecklistItem): string {
  if (it.type === "binary" && it.penalty !== undefined) {
    return `−${it.penalty} pts if missing`;
  }
  if (it.type === "scaled" && it.weight !== undefined) {
    return `0–10 × weight ${it.weight}`;
  }
  if (it.type === "geo_quartile") {
    return "Quartile-scaled (0/3/7/10)";
  }
  return "";
}
</script>

<template>
  <div>
    <div class="mb-6">
      <NuxtLink to="/settings" class="text-sm text-mute hover:text-text">← Settings</NuxtLink>
    </div>

    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">SEO checklist</h1>
        <p class="text-mute">
          The {{ items.length }} signals every audit scores. Source:
          <span class="font-mono text-xs">{{ data?.source ?? "checklist.json" }}</span>
          · v{{ data?.version }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-mute">
        <span class="inline-flex items-center gap-2">
          <span class="rounded-md border border-good/30 bg-good/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-good">
            Rules
          </span>
          <span>deterministic</span>
        </span>
        <span class="hidden h-3 w-px bg-border sm:inline-block" aria-hidden="true" />
        <span class="inline-flex items-center gap-2">
          <span class="rounded-md border border-accent/30 bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            AI
          </span>
          <span>Claude / local LLM</span>
        </span>
        <span class="hidden h-3 w-px bg-border sm:inline-block" aria-hidden="true" />
        <span class="inline-flex items-center gap-2">
          <span class="rounded-md border border-warn/30 bg-warn/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn">
            Rules + AI
          </span>
          <span>hybrid</span>
        </span>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="flex flex-wrap items-center gap-3">
        <input
          v-model="search"
          type="text"
          placeholder="Search title, description, id…"
          class="flex-1 min-w-[200px] rounded-lg border border-border bg-surface2 px-3 py-2 text-sm placeholder-mute focus:border-accent focus:outline-none"
        />
        <select
          v-model="activeMode"
          class="rounded-lg border border-border bg-surface2 px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="all">All scoring modes</option>
          <option value="deterministic">Rules only</option>
          <option value="claude">AI only</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      <div class="mt-3 flex flex-wrap gap-1.5">
        <button
          class="rounded-full px-3 py-1 text-xs transition-colors"
          :class="
            activeCategory === 'all'
              ? 'bg-accent text-bg font-semibold'
              : 'border border-border bg-surface2 text-mute hover:text-text'
          "
          @click="activeCategory = 'all'"
        >
          All ({{ items.length }})
        </button>
        <button
          v-for="cat in categoryOrder"
          :key="cat"
          class="rounded-full px-3 py-1 text-xs transition-colors"
          :class="
            activeCategory === cat
              ? 'bg-accent text-bg font-semibold'
              : 'border border-border bg-surface2 text-mute hover:text-text'
          "
          @click="activeCategory = cat"
        >
          {{ categories[cat]?.label ?? cat }} ({{ categoryCount(cat) }})
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="filtered.length === 0" class="card text-center text-mute">
      No checklist items match the current filters.
    </div>

    <!-- Grouped list -->
    <div v-else class="space-y-6">
      <section
        v-for="cat in categoryOrder.filter((c) => grouped.get(c)?.length)"
        :key="cat"
        class="card"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold">
            {{ categories[cat]?.label ?? cat }}
          </h2>
          <span class="text-xs text-mute">
            {{ grouped.get(cat)?.length }} item(s) · base {{ categories[cat]?.base ?? 100 }}
          </span>
        </div>

        <div class="space-y-3">
          <article
            v-for="it in grouped.get(cat)"
            :key="it.id"
            class="rounded-lg border border-border bg-surface2/40 px-4 py-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-semibold">{{ it.title }}</h3>
                  <span
                    class="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    :class="modeBadgeClass(it.scoring_mode)"
                  >
                    {{ modeLabel(it.scoring_mode) }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-mute">{{ it.description }}</p>
              </div>
              <div class="shrink-0 text-right">
                <div class="text-[10px] uppercase tracking-wider text-mute">Impact</div>
                <div class="text-xs font-semibold tabular-nums">{{ impactLabel(it) }}</div>
              </div>
            </div>
            <div
              v-if="it.how_to_evaluate"
              class="mt-2 rounded-md border border-border/50 bg-bg/40 px-3 py-2 text-xs text-mute"
            >
              <span class="font-semibold text-text/80">How it's evaluated:</span>
              {{ it.how_to_evaluate }}
            </div>
            <div class="mt-2 font-mono text-[10px] text-mute/70">{{ it.id }}</div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
