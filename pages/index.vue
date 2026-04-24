<script setup lang="ts">
import type { Audit, Company } from "~~/server/lib/report/schema";

const { data: companiesData, refresh: refreshCompanies } = await useFetch<{
  companies: Company[];
}>("/api/companies");
const { data: auditsData, refresh: refreshAudits } = await useFetch<{
  audits: Audit[];
}>("/api/audits");

const runningMigration = ref(false);
const migrateResult = ref<null | {
  imported: number;
  skipped: number;
  details: Array<{ slug: string; audit_id: string; skipped: boolean }>;
}>(null);

async function runMigration() {
  runningMigration.value = true;
  try {
    migrateResult.value = await $fetch("/api/migrate", { method: "POST" });
    await Promise.all([refreshCompanies(), refreshAudits()]);
  } finally {
    runningMigration.value = false;
  }
}

function scoreClass(n: number | undefined) {
  if (n === undefined) return "score-pill score-pill-bad";
  if (n >= 70) return "score-pill score-pill-good";
  if (n >= 40) return "score-pill score-pill-warn";
  return "score-pill score-pill-bad";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

const companies = computed(() => companiesData.value?.companies ?? []);
const audits = computed(() => auditsData.value?.audits ?? []);
const auditsByCompany = computed(() => {
  const m = new Map<string, Audit[]>();
  for (const a of audits.value) {
    const list = m.get(a.company_slug) ?? [];
    list.push(a);
    m.set(a.company_slug, list);
  }
  return m;
});
</script>

<template>
  <div>
    <div class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <p class="text-mute">Audits across all companies</p>
      </div>
      <div class="flex gap-3">
        <button
          class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface2"
          :disabled="runningMigration"
          @click="runMigration"
        >
          {{ runningMigration ? "Migrating…" : "Import legacy outputs" }}
        </button>
        <NuxtLink
          to="/new"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90"
        >
          New audit
        </NuxtLink>
      </div>
    </div>

    <div
      v-if="migrateResult"
      class="mb-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm"
    >
      Imported {{ migrateResult.imported }} · Skipped
      {{ migrateResult.skipped }}.
    </div>

    <div v-if="companies.length === 0" class="card text-center text-mute">
      <p class="mb-4">No companies yet.</p>
      <p class="text-sm">
        Click <span class="text-text">Import legacy outputs</span> to pull in the
        Sitenna and Blackmeister audits, or
        <NuxtLink class="text-accent underline" to="/new">start a new one</NuxtLink>.
      </p>
    </div>

    <div v-else class="grid gap-6">
      <section
        v-for="company in companies"
        :key="company.id"
        class="card"
      >
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">
              <NuxtLink
                :to="`/companies/${company.slug}`"
                class="hover:text-accent"
              >
                {{ company.name }}
              </NuxtLink>
            </h2>
            <p class="text-xs text-mute">{{ company.domain ?? "" }}</p>
          </div>
          <span class="text-xs text-mute">
            {{ (auditsByCompany.get(company.slug) ?? []).length }} audit(s)
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-mute">
              <tr>
                <th class="pb-2 font-medium">Date</th>
                <th class="pb-2 font-medium">Source</th>
                <th class="pb-2 font-medium">Overall</th>
                <th class="pb-2 font-medium">SEO</th>
                <th class="pb-2 font-medium">GEO</th>
                <th class="pb-2 font-medium">Pages</th>
                <th class="pb-2 font-medium">Status</th>
                <th class="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="a in auditsByCompany.get(company.slug) ?? []"
                :key="a.id"
                class="border-t border-border"
              >
                <td class="py-2">{{ formatDate(a.created_at) }}</td>
                <td class="py-2 text-mute">{{ a.source_url }}</td>
                <td class="py-2">
                  <span :class="scoreClass(a.site_overall_score)">
                    {{ a.site_overall_score ?? "—" }}
                  </span>
                </td>
                <td class="py-2">
                  <span :class="scoreClass(a.site_seo_score)">
                    {{ a.site_seo_score ?? "—" }}
                  </span>
                </td>
                <td class="py-2">
                  <span :class="scoreClass(a.site_geo_score)">
                    {{ a.site_geo_score ?? "—" }}
                  </span>
                </td>
                <td class="py-2 text-mute">{{ a.pages_audited ?? "—" }}</td>
                <td class="py-2">
                  <span class="text-xs text-mute">{{ a.status }}</span>
                </td>
                <td class="py-2 text-right">
                  <NuxtLink
                    :to="`/audits/${a.id}`"
                    class="text-accent hover:underline"
                  >
                    Open
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
