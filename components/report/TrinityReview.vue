<script setup lang="ts">
defineProps<{
  trinity:
    | { seo?: string; geo?: string; ux?: string }
    | null
    | undefined;
}>();
</script>

<template>
  <div class="card">
    <h2 class="mb-4 text-lg font-semibold">Trinity review</h2>
    <div class="grid gap-4 md:grid-cols-3">
      <div>
        <div class="mb-1 text-xs uppercase tracking-wide text-accent">SEO</div>
        <p class="text-sm leading-relaxed text-text">
          {{ trinity?.seo || "—" }}
        </p>
      </div>
      <div>
        <div class="mb-1 text-xs uppercase tracking-wide text-accent">GEO</div>
        <p class="text-sm leading-relaxed text-text">
          {{ trinity?.geo || "—" }}
        </p>
      </div>
      <div>
        <div class="mb-1 text-xs uppercase tracking-wide text-accent">UX</div>
        <p class="text-sm leading-relaxed text-text">
          {{ trinity?.ux || "—" }}
        </p>
      </div>
    </div>
  </div>
</template>
