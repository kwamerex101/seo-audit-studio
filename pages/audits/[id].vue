<script setup lang="ts">
import type { Audit, AuditReport } from "~~/server/lib/report/schema";

const route = useRoute();
const id = computed(() => String(route.params.id));

const { data } = await useFetch<{
  audit: Audit;
  report: AuditReport | null;
  has_html_report: boolean;
}>(() => `/api/audits/${id.value}`);

function scoreClass(n: number | undefined) {
  if (n === undefined) return "score-pill score-pill-bad";
  if (n >= 70) return "score-pill score-pill-good";
  if (n >= 40) return "score-pill score-pill-warn";
  return "score-pill score-pill-bad";
}

function formatDate(iso: string | undefined | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const report = computed(() => data.value?.report);
const audit = computed(() => data.value?.audit);
const hasHtmlReport = computed(() => data.value?.has_html_report ?? false);

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

    <div v-if="report" class="mb-8 flex flex-wrap items-start justify-between gap-4">
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
          title="Opens the full HTML report and triggers the browser print dialog (Save as PDF)"
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

    <div class="mb-8 grid grid-cols-3 gap-4">
      <div class="card">
        <div class="text-xs uppercase tracking-wide text-mute">Overall</div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-3xl font-bold">{{ report?.site_overall_score ?? "—" }}</span>
          <span :class="scoreClass(report?.site_overall_score)">of 100</span>
        </div>
      </div>
      <div class="card">
        <div class="text-xs uppercase tracking-wide text-mute">SEO</div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-3xl font-bold">{{ report?.site_seo_score ?? "—" }}</span>
          <span :class="scoreClass(report?.site_seo_score)">of 100</span>
        </div>
      </div>
      <div class="card">
        <div class="text-xs uppercase tracking-wide text-mute">GEO</div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-3xl font-bold">{{ report?.site_geo_score ?? "—" }}</span>
          <span :class="scoreClass(report?.site_geo_score)">of 100</span>
        </div>
      </div>
    </div>

    <div v-if="report" class="card">
      <h2 class="mb-3 text-lg font-semibold">Top actions</h2>
      <ol class="ml-5 list-decimal space-y-2 text-sm text-mute">
        <li v-for="(a, i) in report.top_actions" :key="i" class="text-text">
          {{ a }}
        </li>
      </ol>
    </div>

    <div v-else class="card text-mute">
      Report file not available for this audit yet.
    </div>

    <div class="mt-6 rounded-lg border border-dashed border-border p-6 text-sm text-mute">
      <p class="mb-2 text-text">Interactive report viewer and Q&amp;A chat are coming in later phases.</p>
      <p>
        Phase 1 ships the data layer and migration. The full interactive viewer
        (gauges, TO-DO table, per-page drilldown, chat panel) lands in Phases 4–6.
      </p>
    </div>
  </div>
</template>
