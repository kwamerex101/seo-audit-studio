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
  cancelled?: boolean;
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

const cancelling = ref(false);
async function cancel() {
  if (cancelling.value) return;
  cancelling.value = true;
  stoppingAt.value = Date.now();
  try {
    await $fetch(`/api/jobs/${props.jobId}/cancel`, { method: "POST" });
  } catch (e) {
    console.warn("cancel failed", e);
  } finally {
    cancelling.value = false;
  }
}

const running = computed(() =>
  job.value && job.value.step !== "done" && job.value.step !== "failed",
);
const wasCancelled = computed(
  () => job.value?.cancelled || /cancel/i.test(job.value?.message ?? ""),
);
const isFailed = computed(
  () => job.value?.step === "failed" || Boolean(error.value),
);
const lastReachedStep = computed(() => {
  if (!job.value) return "";
  const idx = stepOrder.indexOf(job.value.step);
  if (idx > 0) return stepOrder[idx - 1];
  return job.value.step;
});
const stoppedAtLabel = computed(() => {
  const map: Record<string, string> = {
    sitemap: "Sitemap discovery",
    crawl: "Crawl",
    score_deterministic: "Rules scoring",
    score_claude: "AI scoring",
    narrative: "Narrative",
    persist: "Persist",
  };
  return map[lastReachedStep.value] ?? lastReachedStep.value;
});

// ── Force-stop fallback for hung jobs ─────────────────
const stoppingAt = ref<number | null>(null);
const forceStopVisible = ref(false);
const forceStopError = ref<string | null>(null);
const forceStopBusy = ref(false);
let stoppingTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => wasCancelled.value || cancelling.value,
  (isStopping) => {
    if (isStopping && stoppingAt.value === null) {
      stoppingAt.value = Date.now();
    }
    if (isStopping && !stoppingTimer) {
      stoppingTimer = setTimeout(() => {
        if (running.value && (wasCancelled.value || cancelling.value)) {
          forceStopVisible.value = true;
        }
      }, 15_000);
    }
    if (!isStopping) {
      if (stoppingTimer) { clearTimeout(stoppingTimer); stoppingTimer = null; }
      stoppingAt.value = null;
      forceStopVisible.value = false;
    }
  },
);

onBeforeUnmount(() => {
  if (stoppingTimer) clearTimeout(stoppingTimer);
});

async function forceStop() {
  if (forceStopBusy.value) return;
  forceStopBusy.value = true;
  forceStopError.value = null;
  try {
    await $fetch(`/api/jobs/${props.jobId}/force-cancel`, { method: "POST" });
  } catch (e: any) {
    forceStopError.value = e?.data?.message ?? e?.message ?? "Force stop failed";
  } finally {
    forceStopBusy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">Audit progress</h2>
      <div class="flex items-center gap-3">
        <span class="text-xs text-mute tabular-nums">{{ job?.pct ?? 0 }}%</span>
        <button
          v-if="running && !wasCancelled && !cancelling"
          class="rounded-lg border border-bad/40 bg-bad/15 px-3 py-1 text-xs font-semibold text-bad hover:bg-bad/25"
          @click="cancel"
        >
          Stop
        </button>
        <template v-else-if="running && (wasCancelled || cancelling)">
          <span class="rounded-lg border border-bad/40 bg-bad/10 px-3 py-1 text-xs font-semibold text-bad/70">
            Stopping…
          </span>
          <button
            v-if="forceStopVisible"
            class="rounded-lg border border-bad bg-bad/20 px-3 py-1 text-xs font-bold text-bad hover:bg-bad/35 disabled:opacity-50"
            :disabled="forceStopBusy"
            title="Job appears hung — force-terminate it immediately"
            @click="forceStop"
          >
            {{ forceStopBusy ? "Forcing…" : "Force stop" }}
          </button>
        </template>
      </div>
    </div>

    <div class="mb-4 h-2 overflow-hidden rounded-full bg-surface2">
      <div
        class="h-full rounded-full transition-all duration-500 ease-out"
        :class="
          isFailed
            ? 'bg-bad'
            : running
              ? 'progress-fill bg-good'
              : 'bg-good'
        "
        :style="{ width: `${job?.pct ?? 0}%` }"
      />
    </div>

    <div
      class="mb-4 text-sm"
      :class="isFailed ? 'text-bad' : 'text-text'"
    >
      {{ job?.message ?? "Starting…" }}
    </div>

    <div
      v-if="forceStopVisible && !forceStopError"
      class="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn"
    >
      Job is taking longer than expected to stop. If it appears stuck, click <strong>Force stop</strong> to terminate it immediately.
    </div>
    <div
      v-if="forceStopError"
      class="mb-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad"
    >
      Force stop failed: {{ forceStopError }}
    </div>

    <ol class="flex flex-wrap items-center gap-2 text-xs">
      <li
        v-for="(s, i) in steps"
        :key="s.key"
        class="flex items-center gap-1"
      >
        <span
          class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-colors duration-300"
          :class="[
            isFailed && lastReachedStep === s.key
              ? 'bg-bad text-bg shadow-[0_0_0_3px_rgba(248,113,113,0.25)]'
              : isFailed && job && reachedIndex(job.step) > reachedIndex(s.key)
                ? 'bg-bad/40 text-bg/80'
                : job && reachedIndex(job.step) >= reachedIndex(s.key)
                  ? 'bg-good text-bg shadow-[0_0_0_3px_rgba(74,222,128,0.18)]'
                  : 'bg-surface2 text-mute',
          ]"
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

    <div
      v-if="isFailed || wasCancelled"
      class="mt-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2.5 text-sm text-bad"
    >
      <div class="flex items-start gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div class="flex-1">
          <div class="font-semibold">
            {{
              wasCancelled
                ? "Stopped by user"
                : "Audit stopped due to an error"
            }}
          </div>
          <div class="mt-0.5 text-xs">
            <span v-if="stoppedAtLabel" class="opacity-80">
              At step: <strong>{{ stoppedAtLabel }}</strong>
            </span>
            <template v-if="error && !wasCancelled">
              <span class="opacity-60"> · </span>
              <span class="break-all">{{ error }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
