<script setup lang="ts">
import type { Audit, AuditReport } from "~~/server/lib/report/schema";

const route = useRoute();
const id = computed(() => String(route.params.id));
const queryJobId = computed(() =>
  typeof route.query.job === "string" ? route.query.job : "",
);

const { data, refresh } = await useFetch<{
  audit: Audit;
  report: AuditReport | null;
  has_html_report: boolean;
}>(() => `/api/audits/${id.value}`);

// Auto-detect any running or recently-failed job for this audit so progress
// persists across page navigation. The query param wins if explicitly set.
const { data: activeJobData, refresh: refreshActiveJob } = await useFetch<{
  job: { id: string; step: string } | null;
}>(() => `/api/audits/${id.value}/active-job`);

const jobId = computed(() => {
  if (queryJobId.value) return queryJobId.value;
  return activeJobData.value?.job?.id ?? "";
});

const jobJustFinished = ref(false);
async function onJobDone() {
  jobJustFinished.value = true;
  await refresh();
  await refreshActiveJob();
  // Strip ?job= so refreshes don't keep re-attaching the stream.
  if (queryJobId.value) {
    await navigateTo(`/audits/${id.value}`, { replace: true });
  }
}

const showJobPanel = computed(
  () => Boolean(jobId.value) && !jobJustFinished.value,
);

watch(jobId, (next, prev) => {
  // A new job started — reset the "finished" flag so its panel shows up.
  if (next && next !== prev) jobJustFinished.value = false;
});

const rerunning = ref(false);
async function rerunWithAi() {
  if (rerunning.value || !data.value?.report) return;
  rerunning.value = true;
  try {
    const res = await $fetch<{ job_id: string; audit_id: string }>(
      "/api/audits",
      {
        method: "POST",
        body: {
          url: data.value.report.source_value,
          countries: data.value.report.countries ?? [],
          max_pages: 0,
        },
      },
    );
    await navigateTo(`/audits/${res.audit_id}?job=${res.job_id}`);
  } catch (err) {
    rerunning.value = false;
    console.error("rerun failed:", err);
  }
}

const rescoring = ref(false);
const rescoreError = ref<string | null>(null);

const retryingFailed = ref(false);
async function retryFailedAi() {
  if (retryingFailed.value || !audit.value) return;
  retryingFailed.value = true;
  try {
    const res = await $fetch<{ job_id: string }>(
      `/api/audits/${audit.value.id}/rescore-failed`,
      { method: "POST" },
    );
    await navigateTo(`/audits/${audit.value.id}?job=${res.job_id}`);
  } catch (err: any) {
    rescoreError.value =
      err?.data?.message ?? err?.message ?? "Retry failed";
  } finally {
    retryingFailed.value = false;
  }
}

const exporting = ref(false);
const exportSuccess = ref<{ md: string; html: string; messages: number; done: number } | null>(null);
async function exportSession() {
  if (exporting.value || !audit.value) return;
  exporting.value = true;
  exportSuccess.value = null;
  try {
    const res = await $fetch<{
      filename: string;
      message_count: number;
      done_count: number;
    }>(`/api/audits/${audit.value.id}/session`, { method: "POST" });
    const md = `/api/audits/${audit.value.id}/sessions/${res.filename}.md?download=1`;
    const html = `/api/audits/${audit.value.id}/sessions/${res.filename}.html`;
    exportSuccess.value = {
      md,
      html,
      messages: res.message_count,
      done: res.done_count,
    };
    // Auto-open the HTML view in a new tab
    window.open(html, "_blank", "noopener");
  } catch (err: any) {
    rescoreError.value =
      err?.data?.message ?? err?.message ?? "Export failed";
  } finally {
    exporting.value = false;
  }
}
async function rescoreAi() {
  if (rescoring.value || !audit.value) return;
  rescoreError.value = null;
  rescoring.value = true;
  try {
    const res = await $fetch<{ job_id: string }>(
      `/api/audits/${audit.value.id}/rescore`,
      { method: "POST" },
    );
    await navigateTo(`/audits/${audit.value.id}?job=${res.job_id}`);
  } catch (err: any) {
    rescoreError.value =
      err?.data?.message ?? err?.message ?? "Failed to start rescore";
  } finally {
    // Same-route navigateTo does NOT remount the page, so we must clear the
    // flag explicitly. The JobProgress card takes over the visual feedback.
    rescoring.value = false;
  }
}

// Defensive: if a job query param is present (kicked off elsewhere) and our
// rescoring flag is somehow still true on mount, clear it.
watch(
  jobId,
  (id) => {
    if (id) rescoring.value = false;
  },
  { immediate: true },
);

import { formatAbsolute } from "~/utils/date";
function formatDate(iso: string | undefined | null) {
  return formatAbsolute(iso);
}

const activeTab = ref<"full" | "executive">("full");

const report = computed(() => data.value?.report);
const audit = computed(() => data.value?.audit);
const hasHtmlReport = computed(() => data.value?.has_html_report ?? false);
const aiScoringStatus = computed(() => {
  const r = data.value?.report as unknown as
    | { ai_scoring_status?: string }
    | null
    | undefined;
  return r?.ai_scoring_status ?? "complete";
});
const aiFailedUrls = computed<string[]>(() => {
  const r = data.value?.report as unknown as
    | { ai_failed_urls?: string[] }
    | null
    | undefined;
  return r?.ai_failed_urls ?? [];
});

function openForPrint() {
  if (!audit.value) return;
  window.open(
    `/api/audits/${audit.value.id}/html?print=1`,
    "_blank",
    "noopener",
  );
}
function downloadHtml() {
  if (!audit.value) return;
  window.location.href = `/api/audits/${audit.value.id}/html?download=1`;
}
</script>

<template>
  <div v-if="data">
    <div class="mb-6">
      <NuxtLink to="/" class="text-sm text-mute hover:text-text">← Dashboard</NuxtLink>
    </div>

    <div
      v-if="report"
      class="mb-8 flex flex-wrap items-start justify-between gap-4"
    >
      <div>
        <div class="mb-2 text-sm text-mute">{{ report.source_value }}</div>
        <h1 class="text-2xl font-bold">{{ report.site_name }}</h1>
        <div class="mt-1 text-sm text-mute">
          Generated {{ formatDate(report.generated_at) }} ·
          {{ report.pages_audited }} pages audited ·
          <NuxtLink
            :to="`/companies/${audit?.company_slug}`"
            class="text-accent hover:underline"
          >
            {{ audit?.company_slug }}
          </NuxtLink>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="rescoring || !audit"
          title="Re-run Claude scoring + narrative on the existing crawl. No re-crawl."
          @click="rescoreAi"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
            :class="rescoring ? 'animate-spin' : ''"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
            <polyline points="21 3 21 8 16 8" />
          </svg>
          {{ rescoring ? "Starting…" : "Re-run AI checks" }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="exporting || !audit"
          title="Export Q&A transcript + done items as MD + HTML"
          @click="exportSession"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {{ exporting ? "Exporting…" : "Export session" }}
        </button>
      </div>
    </div>

    <!-- Tab switcher -->
    <div v-if="report" class="mb-6 flex gap-1 border-b border-border">
      <button
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="activeTab === 'full'
          ? 'border-b-2 border-accent text-accent -mb-px'
          : 'text-mute hover:text-text'"
        @click="activeTab = 'full'"
      >
        Full Report
      </button>
      <button
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="activeTab === 'executive'
          ? 'border-b-2 border-accent text-accent -mb-px'
          : 'text-mute hover:text-text'"
        @click="activeTab = 'executive'"
      >
        Executive Report
      </button>
    </div>

    <div v-if="showJobPanel" class="mb-6">
      <JobsJobProgress :job-id="jobId" @done="onJobDone" />
    </div>

    <p
      v-if="rescoreError"
      class="mb-6 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
    >
      {{ rescoreError }}
    </p>

    <div
      v-if="exportSuccess"
      class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm text-good"
    >
      <span>
        Session report exported · {{ exportSuccess.messages }} Q&amp;A turns ·
        {{ exportSuccess.done }} items marked done
      </span>
      <span class="flex gap-2">
        <a
          :href="exportSuccess.html"
          target="_blank"
          rel="noopener"
          class="rounded-lg border border-good/40 bg-good/15 px-2.5 py-1 text-xs font-semibold text-good hover:bg-good/25"
        >
          Open HTML
        </a>
        <a
          :href="exportSuccess.md"
          class="rounded-lg border border-good/40 bg-good/15 px-2.5 py-1 text-xs font-semibold text-good hover:bg-good/25"
        >
          Download MD
        </a>
      </span>
    </div>

    <details
      v-if="aiFailedUrls.length > 0"
      class="mb-6 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn"
    >
      <summary class="cursor-pointer font-medium">
        <span class="inline-flex items-center gap-2">
          <span>
            AI scoring failed for {{ aiFailedUrls.length }} page{{
              aiFailedUrls.length === 1 ? "" : "s"
            }}. Deterministic results are kept.
          </span>
        </span>
      </summary>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-warn/80">
          Retry runs AI only on the {{ aiFailedUrls.length }} failed
          page{{ aiFailedUrls.length === 1 ? "" : "s" }} — the other pages keep
          their existing scores. Much faster than a full re-run.
        </p>
        <button
          class="flex items-center gap-1.5 rounded-lg border border-warn/60 bg-warn/20 px-3 py-1.5 text-xs font-semibold text-warn hover:bg-warn/30 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="retryingFailed"
          @click="retryFailedAi"
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
            :class="retryingFailed ? 'animate-spin' : ''"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
            <polyline points="21 3 21 8 16 8" />
          </svg>
          {{
            retryingFailed
              ? "Starting…"
              : `Retry ${aiFailedUrls.length} failed page${aiFailedUrls.length === 1 ? "" : "s"}`
          }}
        </button>
      </div>

      <ul class="mt-3 max-h-40 overflow-y-auto rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-xs">
        <li v-for="u in aiFailedUrls" :key="u" class="break-all">{{ u }}</li>
      </ul>
    </details>

    <div
      v-if="aiScoringStatus === 'pending'"
      class="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn"
    >
      <div>
        AI scoring was skipped for this audit (Claude items: direct answer,
        E-E-A-T, citation readiness, information gain, keyword tiers,
        competitors, Trinity review). Start Osaurus, ensure the
        <code>claude</code> CLI is on PATH, or start cursor-api and click
        Re-run to populate them.
      </div>
      <button
        class="shrink-0 rounded-lg border border-warn/60 bg-warn/20 px-3 py-1.5 text-xs font-semibold text-warn hover:bg-warn/30"
        :disabled="rerunning"
        @click="rerunWithAi"
      >
        {{ rerunning ? "Starting…" : "Re-run with AI" }}
      </button>
    </div>

    <!-- Full Report tab -->
    <template v-if="activeTab === 'full'">
      <!-- Download buttons -->
      <div v-if="report" class="mb-6 flex flex-wrap items-center justify-end gap-2">
        <button
          class="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90"
          @click="openForPrint"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          Download PDF
        </button>
        <button
          class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface2"
          @click="downloadHtml"
        >
          Download HTML
        </button>
        <a
          v-if="hasHtmlReport"
          :href="`/api/audits/${audit?.id}/html`"
          target="_blank"
          rel="noopener"
          class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface2"
        >
          Open full report
        </a>
      </div>

      <div v-if="report" class="grid grid-cols-3 gap-4">
        <ReportScoreGauge label="Overall" :value="report.site_overall_score" />
        <ReportScoreGauge label="SEO" :value="report.site_seo_score" />
        <ReportScoreGauge label="GEO" :value="report.site_geo_score" />
      </div>

      <div v-if="report" class="mt-6">
        <ReportCategoryBars :averages="report.site_category_averages" />
      </div>

      <div v-if="report" class="mt-6">
        <ReportTrinityReview
          :trinity="report.trinity_review"
          :audit-id="id"
          @refreshed="refresh"
        />
      </div>

      <div v-if="report && report.top_actions && report.top_actions.length > 0" class="mt-6 card">
        <h2 class="mb-3 text-lg font-semibold">Top actions</h2>
        <ol class="ml-5 list-decimal space-y-2 text-sm text-text">
          <li v-for="(a, i) in report.top_actions" :key="i">{{ a }}</li>
        </ol>
      </div>

      <div v-if="report" class="mt-6">
        <ReportKeywordTiers
          :tiers="report.keyword_tiers"
          :competitors="report.competitors"
        />
      </div>

      <div v-if="report" class="mt-6">
        <ReportGeoReadiness :geo="report.geo_readiness" />
      </div>

      <div v-if="report" class="mt-6">
        <ReportSkillSummary :summary="report.skill_based_summary" />
      </div>

      <div v-if="report" class="mt-6">
        <ReportTodoTable :audit-id="id" :items="report.todo_list as any" />
      </div>

      <div v-if="report && report.implementation_plan.length > 0" class="mt-6">
        <ReportImplementationPlan
          :audit-id="id"
          :items="report.implementation_plan as any"
        />
      </div>

      <div v-if="report" class="mt-6">
        <ReportPagesTable :pages="report.pages as any" />
      </div>

      <div v-if="!report" class="card">
      <div class="flex items-start gap-4">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-good/15 text-good"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-5 w-5 animate-pulse"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <div>
          <h2 class="text-base font-semibold">Audit in progress</h2>
          <p class="mt-1 text-sm text-mute">
            We'll discover the sitemap, crawl every page, score against the
            checklist, and have Claude write the narrative. The report and
            chat will appear here as soon as the job completes — you can
            navigate away and come back any time.
          </p>
          <ul class="mt-4 grid gap-2 text-xs text-mute sm:grid-cols-2">
            <li>· Sitemap walk (full coverage, no cap)</li>
            <li>· Polite crawl with rate limiting</li>
            <li>· Deterministic + AI scoring</li>
            <li>· Trinity review + keyword tiers</li>
            <li>· Per-page issue flagging</li>
            <li>· Implementation plan</li>
          </ul>
        </div>
      </div>
    </div>

      <ChatWidget v-if="report" :audit-id="id" />
    </template>
    <!-- Executive Report tab -->
    <template v-else-if="activeTab === 'executive'">
      <ReportExecReport v-if="report" :report="report" :audit-id="id" />
    </template>
  </div>
</template>
