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

const selected = ref<Set<string>>(new Set());
const deleting = ref(false);
const confirmingDelete = ref(false);
const deleteError = ref<string | null>(null);

const dialogCompany = ref<Company | null>(null);
function openCompany(c: Company) {
  dialogCompany.value = c;
}
function closeDialog() {
  dialogCompany.value = null;
}
async function onCompanyDeleted() {
  await Promise.all([refreshCompanies(), refreshAudits()]);
}

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

function statusClass(status: string | undefined) {
  switch (status) {
    case "completed":
      return "bg-good/15 text-good";
    case "running":
      return "bg-accent/15 text-accent";
    case "queued":
      return "bg-warn/15 text-warn";
    case "failed":
      return "bg-bad/15 text-bad";
    default:
      return "bg-surface2 text-mute";
  }
}

import { formatDate as fmtDate, formatAbsolute } from "~/utils/date";
function formatDate(iso: string) {
  return fmtDate(iso);
}
function formatTitle(iso: string) {
  return formatAbsolute(iso);
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

function toggleAudit(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function isAllSelectedFor(slug: string): boolean {
  const list = auditsByCompany.value.get(slug) ?? [];
  return list.length > 0 && list.every((a) => selected.value.has(a.id));
}

function toggleAllForCompany(slug: string) {
  const list = auditsByCompany.value.get(slug) ?? [];
  const next = new Set(selected.value);
  const all = isAllSelectedFor(slug);
  for (const a of list) {
    if (all) next.delete(a.id);
    else next.add(a.id);
  }
  selected.value = next;
}

function clearSelection() {
  selected.value = new Set();
  confirmingDelete.value = false;
}

async function deleteSelected() {
  if (deleting.value || selected.value.size === 0) return;
  deleting.value = true;
  deleteError.value = null;
  const ids = Array.from(selected.value);
  try {
    await Promise.all(
      ids.map((id) =>
        $fetch(`/api/audits/${id}`, { method: "DELETE" }).catch((err) => {
          throw new Error(`${id}: ${err?.data?.message ?? err?.message ?? "delete failed"}`);
        }),
      ),
    );
    selected.value = new Set();
    confirmingDelete.value = false;
    await Promise.all([refreshCompanies(), refreshAudits()]);
  } catch (err: any) {
    deleteError.value =
      err?.message ?? "One or more deletes failed. Reloaded the dashboard.";
    await Promise.all([refreshCompanies(), refreshAudits()]);
  } finally {
    deleting.value = false;
  }
}
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

    <Transition name="chat-panel">
      <div
        v-if="selected.size > 0"
        class="sticky top-2 z-30 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-surface2/95 px-4 py-2.5 text-sm shadow-lg backdrop-blur"
      >
        <div class="flex items-center gap-3">
          <span class="font-semibold text-text">
            {{ selected.size }} selected
          </span>
          <button
            class="text-xs text-mute hover:text-text"
            @click="clearSelection"
          >
            Clear
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span
            v-if="confirmingDelete"
            class="text-xs text-warn"
          >
            Permanently delete {{ selected.size }} audit{{ selected.size === 1 ? "" : "s" }} + report files?
          </span>
          <button
            v-if="!confirmingDelete"
            class="rounded-lg border border-bad/40 bg-bad/15 px-3 py-1.5 text-xs font-semibold text-bad hover:bg-bad/25"
            @click="confirmingDelete = true"
          >
            Delete selected
          </button>
          <template v-else>
            <button
              class="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface2"
              :disabled="deleting"
              @click="confirmingDelete = false"
            >
              Cancel
            </button>
            <button
              class="rounded-lg bg-bad px-3 py-1.5 text-xs font-semibold text-bg hover:bg-bad/90 disabled:opacity-50"
              :disabled="deleting"
              @click="deleteSelected"
            >
              {{ deleting ? "Deleting…" : "Yes, delete" }}
            </button>
          </template>
        </div>
      </div>
    </Transition>

    <p
      v-if="deleteError"
      class="mb-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
    >
      {{ deleteError }}
    </p>

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
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <button
              type="button"
              class="group flex items-baseline gap-2 text-left"
              :title="`View ${company.name} summary`"
              @click="openCompany(company)"
            >
              <h2 class="text-lg font-semibold group-hover:text-accent">
                {{ company.name }}
              </h2>
              <span
                class="text-xs text-mute opacity-60 transition-opacity group-hover:opacity-100"
              >
                ⓘ summary
              </span>
            </button>
            <p class="text-xs text-mute">{{ company.domain ?? "" }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-mute">
              {{ (auditsByCompany.get(company.slug) ?? []).length }} audit(s)
            </span>
            <NuxtLink
              :to="`/companies/${company.slug}`"
              class="text-xs text-accent hover:underline"
              title="Open company audit history"
            >
              History →
            </NuxtLink>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-mute">
              <tr>
                <th class="w-8 pb-2">
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer rounded border-border bg-surface2 accent-accent"
                    :checked="isAllSelectedFor(company.slug)"
                    :indeterminate="
                      !isAllSelectedFor(company.slug) &&
                      (auditsByCompany.get(company.slug) ?? []).some((a) =>
                        selected.has(a.id),
                      )
                    "
                    @change="toggleAllForCompany(company.slug)"
                    :aria-label="`Select all audits for ${company.name}`"
                  />
                </th>
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
                class="border-t border-border transition-colors"
                :class="
                  selected.has(a.id)
                    ? 'bg-accent/8'
                    : 'hover:bg-surface2/40'
                "
              >
                <td class="py-2">
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer rounded border-border bg-surface2 accent-accent"
                    :checked="selected.has(a.id)"
                    @change="toggleAudit(a.id)"
                    :aria-label="`Select audit from ${formatDate(a.created_at)}`"
                  />
                </td>
                <td class="py-2 tabular-nums" :title="formatTitle(a.created_at)">
                  {{ formatDate(a.created_at) }}
                </td>
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
                  <span
                    class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="statusClass(a.status)"
                  >
                    {{ a.status }}
                  </span>
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

    <CompanyDialog
      :company="dialogCompany"
      :audits="dialogCompany ? auditsByCompany.get(dialogCompany.slug) ?? [] : []"
      @close="closeDialog"
      @deleted="onCompanyDeleted"
    />
  </div>
</template>
