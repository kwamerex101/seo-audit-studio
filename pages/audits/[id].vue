<script setup lang="ts">
import type { Audit, AuditReport } from "~~/server/lib/report/schema";

const route = useRoute();
const id = computed(() => String(route.params.id));
const jobId = computed(() =>
  typeof route.query.job === "string" ? route.query.job : "",
);

const { data, refresh } = await useFetch<{
  audit: Audit;
  report: AuditReport | null;
  has_html_report: boolean;
}>(() => `/api/audits/${id.value}`);

async function onJobDone() {
  await refresh();
  await navigateTo(`/audits/${id.value}`, { replace: true });
}

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

function formatDate(iso: string | undefined | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

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
      <div v-if="hasHtmlReport" class="flex gap-2">
        <button
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90"
          @click="openForPrint"
        >
          Download PDF
        </button>
        <button
          class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface2"
          @click="downloadHtml"
        >
          Download HTML
        </button>
        <a
          :href="`/api/audits/${audit?.id}/html`"
          target="_blank"
          rel="noopener"
          class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface2"
        >
          Open full report
        </a>
      </div>
    </div>

    <div v-if="jobId" class="mb-6">
      <JobsJobProgress :job-id="jobId" @done="onJobDone" />
    </div>

    <div
      v-if="aiScoringStatus === 'pending'"
      class="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn"
    >
      <div>
        AI scoring was skipped for this audit (Claude items: direct answer,
        E-E-A-T, citation readiness, information gain, keyword tiers,
        competitors, Trinity review). Re-run via the local Claude API
        (<code>claude_local_api</code> on
        <code>http://localhost:8765</code>) to populate them.
      </div>
      <button
        class="shrink-0 rounded-lg border border-warn/60 bg-warn/20 px-3 py-1.5 text-xs font-semibold text-warn hover:bg-warn/30"
        :disabled="rerunning"
        @click="rerunWithAi"
      >
        {{ rerunning ? "Starting…" : "Re-run with AI" }}
      </button>
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
      <ReportTrinityReview :trinity="report.trinity_review" />
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
      <ReportTodoTable :items="report.todo_list as any" />
    </div>

    <div v-if="report && report.implementation_plan.length > 0" class="mt-6">
      <ReportImplementationPlan :items="report.implementation_plan as any" />
    </div>

    <div v-if="report" class="mt-6">
      <ReportPagesTable :pages="report.pages as any" />
    </div>

    <div v-else class="card text-mute">
      Report file not available for this audit yet.
    </div>

    <ChatWidget v-if="report" :audit-id="id" />
  </div>
</template>
