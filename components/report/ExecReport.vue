<script setup lang="ts">
import type { AuditReport } from "~~/server/lib/report/schema";
import { formatAbsolute } from "~/utils/date";

const props = defineProps<{
  report: AuditReport;
  auditId: string;
}>();

const topActions = computed(() => (props.report.top_actions ?? []).slice(0, 7));
const competitors = computed(() => props.report.competitors ?? []);
const primaryKeywords = computed(() => (props.report.keyword_tiers?.primary ?? []).slice(0, 8));
const highPlan = computed(() =>
  (props.report.implementation_plan ?? [])
    .filter((p) => !p.completed && ["High", "high", "Critical", "critical"].includes(p.priority ?? ""))
    .slice(0, 10)
);
const geo = computed(() => props.report.geo_readiness);
const cats = computed(() => props.report.site_category_averages ?? {});
const catList = computed(() => [
  { label: "Technical", val: cats.value.technical },
  { label: "On-Page", val: cats.value.on_page },
  { label: "Content", val: cats.value.content },
  { label: "Links", val: cats.value.links },
  { label: "Schema", val: cats.value.schema },
  { label: "GEO", val: cats.value.geo },
].filter((c) => c.val !== undefined));

function scoreColor(v: number) {
  return v >= 70 ? "text-good" : v >= 40 ? "text-warn" : "text-bad";
}
function barColor(v: number) {
  return v >= 70 ? "bg-good" : v >= 40 ? "bg-warn" : "bg-bad";
}
function priColor(p: string) {
  const lp = p.toLowerCase();
  if (lp === "critical") return "bg-bad/15 text-bad";
  if (lp === "high") return "bg-warn/15 text-warn";
  if (lp === "medium") return "bg-accent/10 text-accent";
  return "bg-good/10 text-good";
}

function downloadPdf() {
  window.open(`/api/audits/${props.auditId}/exec-report?print=1`, "_blank", "noopener");
}
function downloadHtml() {
  window.location.href = `/api/audits/${props.auditId}/exec-report?download=1`;
}

const hasNarrative = computed(() => {
  const t = props.report.trinity_review;
  return t && (t.seo || t.geo || t.ux);
});

function geoCheck(val: boolean | undefined): string {
  if (val === undefined) return "–";
  return val ? "✅" : "❌";
}
function geoSignalLabel(val: string | undefined): string | null {
  if (!val || val === "pending_ai" || val === "pending") return null;
  return val;
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-8 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-xs font-semibold uppercase tracking-widest text-accent">Executive Report</div>
        <h2 class="mt-1 text-xl font-bold">{{ report.site_name }}</h2>
        <div class="mt-0.5 text-sm text-mute">
          {{ report.source_value }} ·
          {{ report.pages_audited }} pages audited ·
          {{ formatAbsolute(report.generated_at) }}
        </div>
      </div>
      <div class="flex gap-2">
        <button
          class="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90"
          @click="downloadPdf"
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
      </div>
    </div>

    <!-- Score Overview -->
    <section class="mb-8">
      <h3 class="mb-4 text-xs font-bold uppercase tracking-widest text-mute">Score Overview</h3>
      <div class="grid grid-cols-3 gap-4 mb-5">
        <div v-for="item in [
          { label: 'Overall', val: report.site_overall_score },
          { label: 'SEO', val: report.site_seo_score },
          { label: 'GEO / AI Visibility', val: report.site_geo_score },
        ]" :key="item.label" class="card text-center py-5">
          <div class="text-xs font-semibold uppercase tracking-widest text-mute mb-2">{{ item.label }}</div>
          <div class="text-5xl font-extrabold" :class="scoreColor(item.val)">{{ item.val }}</div>
          <div class="text-xs text-mute mt-1">/ 100</div>
        </div>
      </div>

      <div class="card space-y-3">
        <div v-for="c in catList" :key="c.label" class="flex items-center gap-3">
          <span class="w-20 flex-shrink-0 text-xs text-mute">{{ c.label }}</span>
          <div class="flex-1 h-2 rounded-full bg-border overflow-hidden">
            <div class="h-full rounded-full transition-all" :class="barColor(c.val!)" :style="{ width: `${c.val}%` }" />
          </div>
          <span class="w-7 text-right text-xs font-semibold">{{ c.val }}</span>
        </div>
      </div>
    </section>

    <!-- Executive Summary -->
    <section v-if="hasNarrative" class="mb-8">
      <h3 class="mb-4 text-xs font-bold uppercase tracking-widest text-mute">Executive Summary</h3>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div v-if="report.trinity_review?.seo" class="card">
          <div class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">SEO</div>
          <p class="text-sm text-text/90 leading-relaxed">{{ report.trinity_review.seo }}</p>
        </div>
        <div v-if="report.trinity_review?.geo" class="card">
          <div class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">GEO / AI</div>
          <p class="text-sm text-text/90 leading-relaxed">{{ report.trinity_review.geo }}</p>
        </div>
        <div v-if="report.trinity_review?.ux" class="card">
          <div class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">UX / CRO</div>
          <p class="text-sm text-text/90 leading-relaxed">{{ report.trinity_review.ux }}</p>
        </div>
      </div>
    </section>

    <!-- Top Recommendations -->
    <section v-if="topActions.length > 0" class="mb-8">
      <h3 class="mb-4 text-xs font-bold uppercase tracking-widest text-mute">Top Recommendations</h3>
      <div class="card">
        <ol class="ml-4 list-decimal space-y-2.5">
          <li v-for="(action, i) in topActions" :key="i" class="text-sm pl-1">{{ action }}</li>
        </ol>
      </div>
    </section>

    <!-- Competitive Landscape -->
    <section v-if="competitors.length > 0 || primaryKeywords.length > 0" class="mb-8">
      <h3 class="mb-4 text-xs font-bold uppercase tracking-widest text-mute">Competitive Landscape &amp; Keywords</h3>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div v-if="competitors.length > 0" class="card">
          <div class="mb-3 text-xs font-bold uppercase tracking-widest text-mute">Key Competitors</div>
          <div class="space-y-3">
            <div v-for="c in competitors" :key="c.name" class="border-b border-border pb-2 last:border-0 last:pb-0">
              <div class="font-semibold text-sm">{{ c.name }}</div>
              <div v-if="c.note" class="text-xs text-mute mt-0.5">{{ c.note }}</div>
            </div>
          </div>
        </div>
        <div v-if="primaryKeywords.length > 0" class="card">
          <div class="mb-3 text-xs font-bold uppercase tracking-widest text-mute">Primary Keywords</div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="kw in primaryKeywords"
              :key="String(kw)"
              class="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
            >
              {{ kw }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- GEO / AI Readiness -->
    <section v-if="geo" class="mb-8">
      <h3 class="mb-4 text-xs font-bold uppercase tracking-widest text-mute">AI &amp; GEO Readiness</h3>
      <div class="card">
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div class="flex items-center gap-2 text-sm">
            <span>{{ geoCheck(geo.llms_txt) }}</span>
            <span>llms.txt present</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span>{{ geoCheck(geo.faq_section) }}</span>
            <span>FAQ section</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span>{{ geoCheck(geo.direct_answer_potential) }}</span>
            <span>Direct answer in first 200 words</span>
          </div>
          <div v-if="geoSignalLabel(geo.citation_readiness)" class="flex items-center gap-2 text-sm">
            <span class="text-mute">Citation readiness:</span>
            <span class="font-medium">{{ geo.citation_readiness }}</span>
          </div>
          <div v-if="geoSignalLabel(geo.information_gain)" class="flex items-center gap-2 text-sm">
            <span class="text-mute">Information gain:</span>
            <span class="font-medium">{{ geo.information_gain }}</span>
          </div>
          <div v-if="geoSignalLabel(geo.brand_authority)" class="flex items-center gap-2 text-sm">
            <span class="text-mute">Brand authority:</span>
            <span class="font-medium">{{ geo.brand_authority }}</span>
          </div>
        </div>
        <div v-if="geo.eeat_signals && geo.eeat_signals.length > 0" class="mt-4 flex flex-wrap gap-2">
          <span
            v-for="s in geo.eeat_signals"
            :key="s"
            class="rounded-md border border-good/30 bg-good/10 px-2 py-0.5 text-xs text-good"
          >
            {{ s }}
          </span>
        </div>
      </div>
    </section>

    <!-- Priority Roadmap -->
    <section v-if="highPlan.length > 0" class="mb-8">
      <h3 class="mb-4 text-xs font-bold uppercase tracking-widest text-mute">Priority Roadmap</h3>
      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs text-mute">
              <th class="pb-2 pr-4 font-semibold">#</th>
              <th class="pb-2 pr-4 font-semibold">Action</th>
              <th class="pb-2 pr-4 font-semibold">Effort</th>
              <th class="pb-2 font-semibold">Expected Impact</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, i) in highPlan"
              :key="String(item.id)"
              class="border-b border-border/50 last:border-0"
            >
              <td class="py-2.5 pr-4 text-mute">{{ i + 1 }}</td>
              <td class="py-2.5 pr-4">
                <span class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold mr-2" :class="priColor(item.priority ?? '')">
                  {{ item.priority }}
                </span>
                {{ item.action }}
              </td>
              <td class="py-2.5 pr-4 text-mute whitespace-nowrap">{{ item.effort ?? '—' }}</td>
              <td class="py-2.5 text-mute">{{ item.expected_impact ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- No narrative hint -->
    <div v-if="!hasNarrative" class="card border-warn/30 bg-warn/5 text-sm text-warn">
      Trinity narratives haven't been generated yet. Switch to the Full Report tab and click "Generate narrative" to populate the executive summary.
    </div>
  </div>
</template>
