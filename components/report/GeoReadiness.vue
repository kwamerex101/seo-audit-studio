<script setup lang="ts">
const props = defineProps<{
  geo:
    | {
        llms_txt?: boolean;
        structured_data?: string[];
        missing_schema?: string[];
        faq_section?: boolean;
        direct_answer_potential?: boolean;
        citation_readiness?: string;
        information_gain?: string;
        brand_authority?: string;
        eeat_signals?: string[];
      }
    | null
    | undefined;
}>();

const rows = computed(() => {
  const g = props.geo ?? {};
  return [
    { label: "llms.txt", value: g.llms_txt ? "Yes" : "No", good: !!g.llms_txt },
    {
      label: "Direct answer potential",
      value: g.direct_answer_potential ? "Yes" : "No",
      good: !!g.direct_answer_potential,
    },
    {
      label: "FAQ section",
      value: g.faq_section ? "Yes" : "No",
      good: !!g.faq_section,
    },
    {
      label: "Citation readiness",
      value: g.citation_readiness ?? "—",
      good: g.citation_readiness === "strong",
    },
    {
      label: "Information gain",
      value: g.information_gain ?? "—",
      good: g.information_gain === "high",
    },
    {
      label: "Brand authority",
      value: g.brand_authority ?? "—",
      good: g.brand_authority === "strong",
    },
  ];
});
</script>

<template>
  <div class="card">
    <h2 class="mb-4 text-lg font-semibold">GEO readiness</h2>
    <div class="grid gap-3 sm:grid-cols-2">
      <div
        v-for="(r, i) in rows"
        :key="i"
        class="flex items-center justify-between rounded-lg border border-border bg-surface2/40 px-3 py-2"
      >
        <div class="text-xs text-mute">{{ r.label }}</div>
        <div
          class="text-xs font-semibold"
          :class="r.good ? 'text-good' : 'text-warn'"
        >
          {{ r.value }}
        </div>
      </div>
    </div>

    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <div>
        <div class="mb-1 text-xs uppercase tracking-wide text-accent">
          Structured data
        </div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="t in geo?.structured_data ?? []"
            :key="`sd-${t}`"
            class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs"
          >
            {{ t }}
          </span>
          <span
            v-if="(geo?.structured_data ?? []).length === 0"
            class="text-xs text-mute"
          >
            None detected
          </span>
        </div>
      </div>
      <div>
        <div class="mb-1 text-xs uppercase tracking-wide text-accent">
          Missing schema
        </div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="t in geo?.missing_schema ?? []"
            :key="`ms-${t}`"
            class="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-xs text-warn"
          >
            {{ t }}
          </span>
          <span
            v-if="(geo?.missing_schema ?? []).length === 0"
            class="text-xs text-mute"
          >
            None flagged
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
