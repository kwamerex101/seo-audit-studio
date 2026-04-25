<script setup lang="ts">
const props = defineProps<{
  trinity:
    | { seo?: string; geo?: string; ux?: string }
    | null
    | undefined;
  auditId?: string;
}>();
const emit = defineEmits<{ (e: "refreshed"): void }>();

const isPlaceholder = computed(() => {
  const t = `${props.trinity?.seo ?? ""} ${props.trinity?.geo ?? ""} ${props.trinity?.ux ?? ""}`;
  return (
    t.trim() === "" ||
    /deterministic pass only|pending/i.test(t)
  );
});

const regenerating = ref(false);
const regenError = ref<string | null>(null);
async function regenerate() {
  if (regenerating.value || !props.auditId) return;
  regenerating.value = true;
  regenError.value = null;
  try {
    await $fetch(`/api/audits/${props.auditId}/regenerate-narrative`, {
      method: "POST",
    });
    emit("refreshed");
  } catch (err: any) {
    regenError.value =
      err?.data?.message ?? err?.message ?? "Regenerate failed";
  } finally {
    regenerating.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">Trinity review</h2>
      <button
        v-if="auditId"
        class="flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-3 py-1 text-xs hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="regenerating"
        :title="
          isPlaceholder
            ? 'Run one Claude call to populate Trinity, keyword tiers, competitors, and top actions'
            : 'Refresh narrative from the latest scores'
        "
        @click="regenerate"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-3.5 w-3.5"
          :class="regenerating ? 'animate-spin' : ''"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
          <polyline points="21 3 21 8 16 8" />
        </svg>
        {{
          regenerating
            ? "Regenerating…"
            : isPlaceholder
              ? "Generate narrative"
              : "Refresh narrative"
        }}
      </button>
    </div>

    <p
      v-if="regenError"
      class="mb-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad"
    >
      {{ regenError }}
    </p>

    <p
      v-if="isPlaceholder"
      class="mb-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn"
    >
      Narrative hasn't been generated for this audit yet. One Claude call (~30s)
      populates Trinity review, keyword tiers, competitors, and top actions.
    </p>

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
