<script setup lang="ts">
const props = defineProps<{
  averages:
    | {
        technical?: number;
        on_page?: number;
        content?: number;
        links?: number;
        schema?: number;
        geo?: number;
      }
    | null
    | undefined;
}>();

const rows = computed(() => [
  { key: "technical", label: "Technical", val: props.averages?.technical ?? 0 },
  { key: "on_page", label: "On-Page", val: props.averages?.on_page ?? 0 },
  { key: "content", label: "Content", val: props.averages?.content ?? 0 },
  { key: "links", label: "Links", val: props.averages?.links ?? 0 },
  { key: "schema", label: "Schema", val: props.averages?.schema ?? 0 },
  { key: "geo", label: "GEO", val: props.averages?.geo ?? 0 },
]);

function colorFor(v: number) {
  if (v >= 70) return "bg-good";
  if (v >= 40) return "bg-warn";
  return "bg-bad";
}
</script>

<template>
  <div class="card">
    <h2 class="mb-4 text-lg font-semibold">Category averages</h2>
    <div class="space-y-3">
      <div v-for="r in rows" :key="r.key" class="flex items-center gap-3">
        <div class="w-24 text-sm text-mute">{{ r.label }}</div>
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
          <div
            :class="['h-full rounded-full transition-all', colorFor(r.val)]"
            :style="{ width: `${Math.max(0, Math.min(100, r.val))}%` }"
          />
        </div>
        <div class="w-10 text-right text-sm font-semibold">
          {{ Math.round(r.val) }}
        </div>
      </div>
    </div>
  </div>
</template>
