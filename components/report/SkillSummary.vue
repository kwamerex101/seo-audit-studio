<script setup lang="ts">
const props = defineProps<{
  summary:
    | {
        on_page?: string;
        content?: string;
        technical?: string;
        schema_geo?: string;
      }
    | null
    | undefined;
}>();

const blocks = computed(() => [
  { key: "on_page", label: "On-page", text: props.summary?.on_page },
  { key: "content", label: "Content", text: props.summary?.content },
  { key: "technical", label: "Technical", text: props.summary?.technical },
  { key: "schema_geo", label: "Schema & GEO", text: props.summary?.schema_geo },
]);
</script>

<template>
  <div class="card">
    <h2 class="mb-4 text-lg font-semibold">Skill-based summary</h2>
    <div class="grid gap-4 md:grid-cols-2">
      <div
        v-for="b in blocks"
        :key="b.key"
        class="rounded-lg border border-border bg-surface2/40 p-4"
      >
        <div class="mb-1 text-xs uppercase tracking-wide text-accent">
          {{ b.label }}
        </div>
        <p class="text-sm leading-relaxed text-text">{{ b.text || "—" }}</p>
      </div>
    </div>
  </div>
</template>
