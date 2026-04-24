<script setup lang="ts">
const props = defineProps<{
  items: Array<{
    id?: string | number;
    issue: string;
    fix: string;
    importance?: string;
    severity?: string;
    category?: string;
    status?: string;
    pages_affected?: number | string;
  }>;
}>();

const filter = ref<"all" | "critical" | "warning" | "info">("all");

const filtered = computed(() => {
  if (filter.value === "all") return props.items;
  return props.items.filter((t) => {
    const s = t.severity ?? (t.importance === "High" ? "critical" : "info");
    return s === filter.value;
  });
});

function importanceClass(imp: string | undefined, sev: string | undefined) {
  const s = sev ?? (imp === "High" ? "critical" : imp === "Medium" ? "warning" : "info");
  if (s === "critical") return "bg-bad/15 text-bad";
  if (s === "warning") return "bg-warn/15 text-warn";
  return "bg-mute/15 text-mute";
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex items-center justify-between gap-4">
      <h2 class="text-lg font-semibold">TO-DO list</h2>
      <div class="flex gap-1">
        <button
          v-for="opt in ['all', 'critical', 'warning', 'info'] as const"
          :key="opt"
          class="rounded-lg border px-2.5 py-1 text-xs"
          :class="
            filter === opt
              ? 'border-accent bg-accent/15 text-text'
              : 'border-border bg-surface2 text-mute hover:text-text'
          "
          @click="filter = opt"
        >
          {{ opt }}
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase tracking-wide text-mute">
          <tr class="border-b border-border">
            <th class="pb-2 font-medium">ID</th>
            <th class="pb-2 font-medium">Severity</th>
            <th class="pb-2 font-medium">Issue</th>
            <th class="pb-2 font-medium">Fix</th>
            <th class="pb-2 font-medium">Pages</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in filtered"
            :key="String(t.id)"
            class="border-b border-border/60"
          >
            <td class="py-2 text-mute">{{ t.id }}</td>
            <td class="py-2">
              <span
                :class="['inline-block rounded-full px-2 py-0.5 text-xs font-semibold', importanceClass(t.importance, t.severity)]"
              >
                {{ t.severity ?? t.importance ?? "info" }}
              </span>
            </td>
            <td class="py-2 align-top">{{ t.issue }}</td>
            <td class="py-2 align-top text-mute">{{ t.fix }}</td>
            <td class="py-2 text-mute">{{ t.pages_affected ?? "—" }}</td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="5" class="py-4 text-center text-mute">
              No items at this severity.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
