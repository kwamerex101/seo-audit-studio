<script setup lang="ts">
const props = defineProps<{
  auditId?: string;
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

const filter = ref<"all" | "open" | "done" | "critical" | "warning" | "info">(
  "all",
);

// Local optimistic copy so checkboxes feel instant.
const localItems = ref([...props.items]);
watch(
  () => props.items,
  (next) => {
    localItems.value = [...next];
  },
);

const filtered = computed(() => {
  if (filter.value === "all") return localItems.value;
  if (filter.value === "open")
    return localItems.value.filter((t) => (t.status ?? "open") !== "done");
  if (filter.value === "done")
    return localItems.value.filter((t) => t.status === "done");
  return localItems.value.filter((t) => {
    const s = t.severity ?? (t.importance === "High" ? "critical" : "info");
    return s === filter.value;
  });
});

const openCount = computed(
  () => localItems.value.filter((t) => (t.status ?? "open") !== "done").length,
);
const doneCount = computed(
  () => localItems.value.filter((t) => t.status === "done").length,
);

function importanceClass(imp: string | undefined, sev: string | undefined) {
  const s = sev ?? (imp === "High" ? "critical" : imp === "Medium" ? "warning" : "info");
  if (s === "critical") return "bg-bad/15 text-bad";
  if (s === "warning") return "bg-warn/15 text-warn";
  return "bg-mute/15 text-mute";
}

async function toggle(item: (typeof localItems.value)[number]) {
  if (!props.auditId) return;
  const next = item.status === "done" ? "open" : "done";
  // Optimistic
  item.status = next;
  try {
    await $fetch(`/api/audits/${props.auditId}/item`, {
      method: "PATCH",
      body: { kind: "todo", id: item.id, status: next },
    });
  } catch {
    // revert
    item.status = next === "done" ? "open" : "done";
  }
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-baseline gap-3">
        <h2 class="text-lg font-semibold">TO-DO list</h2>
        <span class="text-xs text-mute tabular-nums">
          {{ doneCount }}/{{ openCount + doneCount }} done
        </span>
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="opt in [
            'all',
            'open',
            'done',
            'critical',
            'warning',
            'info',
          ] as const"
          :key="opt"
          class="rounded-lg border px-2.5 py-1 text-xs transition-colors"
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
            <th class="w-8 pb-2"></th>
            <th class="pb-2 font-medium">ID</th>
            <th class="pb-2 font-medium">Severity</th>
            <th class="pb-2 font-medium">Issue</th>
            <th class="pb-2 font-medium">Fix</th>
            <th class="pb-2 font-medium">Pages</th>
          </tr>
        </thead>
        <tbody class="row-stagger">
          <tr
            v-for="t in filtered"
            :key="String(t.id)"
            class="border-b border-border/60 transition-colors hover:bg-surface2/40"
            :class="t.status === 'done' ? 'opacity-50' : ''"
          >
            <td class="py-2 align-top">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 cursor-pointer rounded border-border bg-surface2 accent-accent disabled:cursor-not-allowed"
                :checked="t.status === 'done'"
                :disabled="!auditId"
                :aria-label="`Mark TO-DO ${t.id} as done`"
                @change="toggle(t)"
              />
            </td>
            <td class="py-2 align-top text-mute">{{ t.id }}</td>
            <td class="py-2 align-top">
              <span
                :class="[
                  'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                  importanceClass(t.importance, t.severity),
                ]"
              >
                {{ t.severity ?? t.importance ?? "info" }}
              </span>
            </td>
            <td
              class="py-2 align-top"
              :class="t.status === 'done' ? 'line-through' : ''"
            >
              {{ t.issue }}
            </td>
            <td class="py-2 align-top text-mute">{{ t.fix }}</td>
            <td class="py-2 align-top text-mute">{{ t.pages_affected ?? "—" }}</td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="py-4 text-center text-mute">
              No items at this filter.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
