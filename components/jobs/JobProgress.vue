<script setup lang="ts">
type JobStep =
  | "queued"
  | "sitemap"
  | "crawl"
  | "score_deterministic"
  | "score_claude"
  | "narrative"
  | "persist"
  | "done"
  | "failed";

type Job = {
  id: string;
  audit_id: string;
  step: JobStep;
  pct: number;
  message: string;
  error: string | null;
  completed_at: string | null;
};

const props = defineProps<{
  jobId: string;
}>();

const emit = defineEmits<{ (e: "done", auditId: string): void }>();

const job = ref<Job | null>(null);
const error = ref<string | null>(null);

const steps: Array<{ key: JobStep; label: string }> = [
  { key: "sitemap", label: "Sitemap" },
  { key: "crawl", label: "Crawl" },
  { key: "score_deterministic", label: "Rules" },
  { key: "score_claude", label: "AI" },
  { key: "narrative", label: "Narrative" },
  { key: "persist", label: "Persist" },
  { key: "done", label: "Done" },
];

const stepOrder: JobStep[] = [
  "queued",
  "sitemap",
  "crawl",
  "score_deterministic",
  "score_claude",
  "narrative",
  "persist",
  "done",
];

function reachedIndex(step: JobStep): number {
  return stepOrder.indexOf(step);
}

let eventSource: EventSource | null = null;

onMounted(() => {
  try {
    eventSource = new EventSource(`/api/jobs/${props.jobId}/stream`);
    eventSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as Job;
        job.value = data;
        if (data.step === "done") {
          emit("done", data.audit_id);
          eventSource?.close();
        } else if (data.step === "failed") {
          error.value = data.error ?? data.message;
          eventSource?.close();
        }
      } catch {
        // ignore parse errors
      }
    };
    eventSource.onerror = () => {
      // silently; heartbeat will reconnect naturally
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});

onBeforeUnmount(() => {
  eventSource?.close();
});
</script>

<template>
  <div class="card">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Audit progress</h2>
      <span class="text-xs text-mute">{{ job?.pct ?? 0 }}%</span>
    </div>

    <div class="mb-4 h-2 overflow-hidden rounded-full bg-surface2">
      <div
        class="h-full rounded-full bg-accent transition-all"
        :style="{ width: `${job?.pct ?? 0}%` }"
      />
    </div>

    <div class="mb-4 text-sm text-text">{{ job?.message ?? "Starting…" }}</div>

    <ol class="flex flex-wrap items-center gap-2 text-xs">
      <li
        v-for="(s, i) in steps"
        :key="s.key"
        class="flex items-center gap-1"
      >
        <span
          class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
          :class="
            job && reachedIndex(job.step) >= reachedIndex(s.key)
              ? 'bg-accent text-bg'
              : 'bg-surface2 text-mute'
          "
        >
          {{ i + 1 }}
        </span>
        <span
          :class="
            job && reachedIndex(job.step) >= reachedIndex(s.key)
              ? 'text-text'
              : 'text-mute'
          "
        >
          {{ s.label }}
        </span>
        <span v-if="i < steps.length - 1" class="text-mute">›</span>
      </li>
    </ol>

    <p
      v-if="error"
      class="mt-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
    >
      Failed: {{ error }}
    </p>
  </div>
</template>
