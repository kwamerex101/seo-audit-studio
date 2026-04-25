<script setup lang="ts">
import type { Audit, Company } from "~~/server/lib/report/schema";

const { data: companiesData } = await useFetch<{ companies: Company[] }>(
  "/api/companies",
);
const { data: auditsData } = await useFetch<{ audits: Audit[] }>("/api/audits");

type SortKey = "date" | "company" | "overall" | "seo" | "geo";
const sortKey = ref<SortKey>("date");
const sortDir = ref<"asc" | "desc">("desc");
const filter = ref("");

const companyBySlug = computed(() => {
  const m = new Map<string, Company>();
  for (const c of companiesData.value?.companies ?? []) m.set(c.slug, c);
  return m;
});

const rows = computed(() => {
  const list = (auditsData.value?.audits ?? []).map((a) => ({
    ...a,
    company_name: companyBySlug.value.get(a.company_slug)?.name ?? a.company_slug,
  }));
  const needle = filter.value.trim().toLowerCase();
  const filtered = needle
    ? list.filter(
        (r) =>
          r.company_name.toLowerCase().includes(needle) ||
          r.source_url.toLowerCase().includes(needle),
      )
    : list;
  const dir = sortDir.value === "asc" ? 1 : -1;
  const keyed = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey.value) {
      case "date":
        cmp = a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
        break;
      case "company":
        cmp = a.company_name.localeCompare(b.company_name);
        break;
      case "overall":
        cmp = (a.site_overall_score ?? 0) - (b.site_overall_score ?? 0);
        break;
      case "seo":
        cmp = (a.site_seo_score ?? 0) - (b.site_seo_score ?? 0);
        break;
      case "geo":
        cmp = (a.site_geo_score ?? 0) - (b.site_geo_score ?? 0);
        break;
    }
    return cmp * dir;
  });
  return keyed;
});

function toggleSort(k: SortKey) {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = k;
    sortDir.value = k === "date" ? "desc" : "asc";
  }
}

function sortIcon(k: SortKey) {
  if (sortKey.value !== k) return "";
  return sortDir.value === "asc" ? " ▲" : " ▼";
}

function scoreClass(n: number | undefined) {
  if (n === undefined) return "score-pill score-pill-bad";
  if (n >= 70) return "score-pill score-pill-good";
  if (n >= 40) return "score-pill score-pill-warn";
  return "score-pill score-pill-bad";
}

import { formatDate as fmtDate, formatAbsolute } from "~/utils/date";
function formatDate(iso: string) {
  return fmtDate(iso);
}
function formatTitle(iso: string) {
  return formatAbsolute(iso);
}
</script>

<template>
  <div>
    <div class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Reports</h1>
        <p class="text-mute">
          All audits across every company, newest first.
        </p>
      </div>
      <div class="w-64">
        <input
          v-model="filter"
          placeholder="Filter by company or URL…"
          class="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
    </div>

    <div v-if="rows.length === 0" class="card text-mute">
      No reports yet.
    </div>

    <div v-else class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-mute">
          <tr class="border-b border-border">
            <th
              class="cursor-pointer pb-3 font-medium hover:text-text"
              @click="toggleSort('date')"
            >
              Timestamp<span class="text-accent">{{ sortIcon("date") }}</span>
            </th>
            <th
              class="cursor-pointer pb-3 font-medium hover:text-text"
              @click="toggleSort('company')"
            >
              Company<span class="text-accent">{{ sortIcon("company") }}</span>
            </th>
            <th class="pb-3 font-medium">Source</th>
            <th
              class="cursor-pointer pb-3 font-medium hover:text-text"
              @click="toggleSort('overall')"
            >
              Overall<span class="text-accent">{{ sortIcon("overall") }}</span>
            </th>
            <th
              class="cursor-pointer pb-3 font-medium hover:text-text"
              @click="toggleSort('seo')"
            >
              SEO<span class="text-accent">{{ sortIcon("seo") }}</span>
            </th>
            <th
              class="cursor-pointer pb-3 font-medium hover:text-text"
              @click="toggleSort('geo')"
            >
              GEO<span class="text-accent">{{ sortIcon("geo") }}</span>
            </th>
            <th class="pb-3 font-medium">Pages</th>
            <th class="pb-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.id"
            class="border-b border-border/60 transition hover:bg-surface2/40"
          >
            <td class="py-3 tabular-nums" :title="formatTitle(r.created_at)">
              {{ formatDate(r.created_at) }}
            </td>
            <td class="py-3">
              <NuxtLink
                :to="`/companies/${r.company_slug}`"
                class="hover:text-accent"
              >
                {{ r.company_name }}
              </NuxtLink>
            </td>
            <td class="py-3 text-mute">{{ r.source_url }}</td>
            <td class="py-3">
              <span :class="scoreClass(r.site_overall_score)">
                {{ r.site_overall_score ?? "—" }}
              </span>
            </td>
            <td class="py-3">
              <span :class="scoreClass(r.site_seo_score)">
                {{ r.site_seo_score ?? "—" }}
              </span>
            </td>
            <td class="py-3">
              <span :class="scoreClass(r.site_geo_score)">
                {{ r.site_geo_score ?? "—" }}
              </span>
            </td>
            <td class="py-3 text-mute">{{ r.pages_audited ?? "—" }}</td>
            <td class="py-3 text-right">
              <NuxtLink
                :to="`/audits/${r.id}`"
                class="text-accent hover:underline"
              >
                Open →
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
