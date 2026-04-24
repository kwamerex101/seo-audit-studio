<script setup lang="ts">
defineProps<{
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

function priorityClass(p: string) {
  const s = p.toLowerCase();
  if (s === "critical" || s === "high") return "bg-bad/15 text-bad";
  if (s === "medium" || s === "important") return "bg-warn/15 text-warn";
  return "bg-mute/15 text-mute";
}
</script>

<template>
  <div class="card">
    <h2 class="mb-4 text-lg font-semibold">Implementation plan</h2>
    <div v-if="items.length === 0" class="text-sm text-mute">
      No items yet.
    </div>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase tracking-wide text-mute">
          <tr class="border-b border-border">
            <th class="pb-2 font-medium">ID</th>
            <th class="pb-2 font-medium">Priority</th>
            <th class="pb-2 font-medium">Action</th>
            <th class="pb-2 font-medium">Effort</th>
            <th class="pb-2 font-medium">Pages</th>
            <th class="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="ip in items"
            :key="String(ip.id)"
            class="border-b border-border/60"
          >
            <td class="py-2 text-mute">{{ ip.id }}</td>
            <td class="py-2">
              <span
                :class="['inline-block rounded-full px-2 py-0.5 text-xs font-semibold', priorityClass(String(ip.priority))]"
              >
                {{ ip.priority }}
              </span>
            </td>
            <td class="py-2 align-top">{{ ip.action }}</td>
            <td class="py-2 text-mute">{{ ip.effort ?? "—" }}</td>
            <td class="py-2 text-mute">{{ ip.pages ?? "—" }}</td>
            <td class="py-2 text-mute">
              {{ ip.completed ? "done" : "open" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
