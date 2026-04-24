<script setup lang="ts">
import type { Audit, Company } from "~~/server/lib/report/schema";

const route = useRoute();
const slug = computed(() => String(route.params.slug));

const { data } = await useFetch<{ company: Company; audits: Audit[] }>(
  () => `/api/companies/${slug.value}`,
);

function scoreClass(n: number | undefined) {
  if (n === undefined) return "score-pill score-pill-bad";
  if (n >= 70) return "score-pill score-pill-good";
  if (n >= 40) return "score-pill score-pill-warn";
  return "score-pill score-pill-bad";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}
</script>

<template>
  <div v-if="data">
    <div class="mb-6">
      <NuxtLink to="/" class="text-sm text-mute hover:text-text">← Dashboard</NuxtLink>
    </div>
    <div class="mb-8 flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ data.company.name }}</h1>
        <p class="text-mute">{{ data.company.domain }}</p>
      </div>
      <NuxtLink
        to="/new"
        class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90"
      >
        Run new audit
      </NuxtLink>
    </div>

    <section class="card">
      <h2 class="mb-4 text-lg font-semibold">Audit history</h2>
      <div v-if="data.audits.length === 0" class="text-mute">
        No audits yet for this company.
      </div>
      <ol v-else class="space-y-3">
        <li
          v-for="a in data.audits"
          :key="a.id"
          class="flex items-center justify-between rounded-lg border border-border bg-surface2/60 px-4 py-3"
        >
          <div>
            <div class="text-sm">{{ formatDate(a.created_at) }}</div>
            <div class="text-xs text-mute">
              {{ a.source_url }} · {{ a.pages_audited ?? 0 }} pages ·
              {{ a.origin }}
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span :class="scoreClass(a.site_overall_score)">
              Overall {{ a.site_overall_score ?? "—" }}
            </span>
            <span :class="scoreClass(a.site_seo_score)">
              SEO {{ a.site_seo_score ?? "—" }}
            </span>
            <span :class="scoreClass(a.site_geo_score)">
              GEO {{ a.site_geo_score ?? "—" }}
            </span>
            <NuxtLink
              :to="`/audits/${a.id}`"
              class="text-sm text-accent hover:underline"
            >
              Open →
            </NuxtLink>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>
