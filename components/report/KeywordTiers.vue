<script setup lang="ts">
defineProps<{
  tiers:
    | {
        primary?: string[] | unknown[];
        secondary?: string[] | unknown[];
        tertiary?: string[] | unknown[];
      }
    | null
    | undefined;
  competitors?: Array<{ name?: string; note?: string }> | null;
}>();

function asList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).filter(Boolean);
}
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2">
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold">Keyword tiers</h2>
      <div class="space-y-4">
        <div>
          <div class="mb-2 text-xs uppercase tracking-wide text-accent">
            Primary
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="k in asList(tiers?.primary)"
              :key="`p-${k}`"
              class="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-text"
            >
              {{ k }}
            </span>
            <span v-if="asList(tiers?.primary).length === 0" class="text-xs text-mute">
              —
            </span>
          </div>
        </div>
        <div>
          <div class="mb-2 text-xs uppercase tracking-wide text-accent">
            Secondary
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="k in asList(tiers?.secondary)"
              :key="`s-${k}`"
              class="rounded-full border border-border bg-surface2 px-3 py-1 text-xs text-text"
            >
              {{ k }}
            </span>
            <span v-if="asList(tiers?.secondary).length === 0" class="text-xs text-mute">
              —
            </span>
          </div>
        </div>
        <div>
          <div class="mb-2 text-xs uppercase tracking-wide text-accent">
            Tertiary (long-tail)
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="k in asList(tiers?.tertiary)"
              :key="`t-${k}`"
              class="rounded-full border border-border bg-surface2/60 px-3 py-1 text-xs text-mute"
            >
              {{ k }}
            </span>
            <span v-if="asList(tiers?.tertiary).length === 0" class="text-xs text-mute">
              —
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold">Competitors</h2>
      <ul v-if="competitors && competitors.length > 0" class="space-y-3">
        <li
          v-for="(c, i) in competitors"
          :key="i"
          class="rounded-lg border border-border bg-surface2/40 px-3 py-2"
        >
          <div class="text-sm font-semibold text-text">{{ c.name ?? "—" }}</div>
          <div v-if="c.note" class="mt-0.5 text-xs text-mute">{{ c.note }}</div>
        </li>
      </ul>
      <div v-else class="text-sm text-mute">
        No competitors listed. Populated by AI narrative pass.
      </div>
    </div>
  </div>
</template>
