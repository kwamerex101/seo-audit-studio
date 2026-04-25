<script setup lang="ts">
const props = defineProps<{
  auditId?: string;
  items: Array<{
    id: string | number;
    action: string;
    priority: string;
    effort?: string;
    pages?: string | number;
    expected_impact?: string;
    completed?: boolean;
  }>;
}>();

const localItems = ref([...props.items]);
watch(
  () => props.items,
  (next) => {
    localItems.value = [...next];
  },
);

const doneCount = computed(
  () => localItems.value.filter((i) => i.completed).length,
);

function priorityClass(p: string) {
  const s = p.toLowerCase();
  if (s === "critical" || s === "high") return "bg-bad/15 text-bad";
  if (s === "medium" || s === "important") return "bg-warn/15 text-warn";
  return "bg-mute/15 text-mute";
}

async function toggle(item: (typeof localItems.value)[number]) {
  if (!props.auditId) return;
  const next = !item.completed;
  item.completed = next;
  try {
    await $fetch(`/api/audits/${props.auditId}/item`, {
      method: "PATCH",
      body: {
        kind: "plan",
        id: item.id,
        status: next ? "done" : "open",
      },
    });
  } catch {
    item.completed = !next;
  }
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex items-baseline justify-between">
      <h2 class="text-lg font-semibold">Implementation plan</h2>
      <span class="text-xs text-mute tabular-nums">
        {{ doneCount }}/{{ localItems.length }} done
      </span>
    </div>
    <div v-if="localItems.length === 0" class="text-sm text-mute">
      No items yet.
    </div>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase tracking-wide text-mute">
          <tr class="border-b border-border">
            <th class="w-8 pb-2"></th>
            <th class="pb-2 font-medium">ID</th>
            <th class="pb-2 font-medium">Priority</th>
            <th class="pb-2 font-medium">Action</th>
            <th class="pb-2 font-medium">Effort</th>
            <th class="pb-2 font-medium">Pages</th>
          </tr>
        </thead>
        <tbody class="row-stagger">
          <tr
            v-for="ip in localItems"
            :key="String(ip.id)"
            class="border-b border-border/60 transition-colors hover:bg-surface2/40"
            :class="ip.completed ? 'opacity-50' : ''"
          >
            <td class="py-2 align-top">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 cursor-pointer rounded border-border bg-surface2 accent-accent disabled:cursor-not-allowed"
                :checked="!!ip.completed"
                :disabled="!auditId"
                :aria-label="`Mark plan ${ip.id} as done`"
                @change="toggle(ip)"
              />
            </td>
            <td class="py-2 align-top text-mute">{{ ip.id }}</td>
            <td class="py-2 align-top">
              <span
                :class="[
                  'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                  priorityClass(String(ip.priority)),
                ]"
              >
                {{ ip.priority }}
              </span>
            </td>
            <td
              class="py-2 align-top"
              :class="ip.completed ? 'line-through' : ''"
            >
              {{ ip.action }}
            </td>
            <td class="py-2 align-top text-mute">{{ ip.effort ?? "—" }}</td>
            <td class="py-2 align-top text-mute">{{ ip.pages ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
