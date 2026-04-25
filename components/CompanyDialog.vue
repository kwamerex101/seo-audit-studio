<script setup lang="ts">
import type { Audit, Company } from "~~/server/lib/report/schema";

const props = defineProps<{
  company: Company | null;
  audits?: Audit[];
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "deleted", slug: string): void;
}>();

type Summary = {
  tagline?: string;
  what_they_do?: string;
  who_they_serve?: string;
  services?: string[];
  positioning?: string;
  things_to_know?: string[];
  generated_at?: string;
  source_audit_id?: string;
};

const open = computed(() => Boolean(props.company));
const loading = ref(false);
const refreshing = ref(false);
const summary = ref<Summary | null>(null);
const error = ref<string | null>(null);
const cached = ref(false);
const confirmingDelete = ref(false);
const deleting = ref(false);

const stats = computed(() => {
  const list = props.audits ?? [];
  const completed = list.filter((a) => a.status === "completed");
  const latest = completed[0];
  const overallScores = completed
    .map((a) => a.site_overall_score)
    .filter((v): v is number => typeof v === "number");
  const avg =
    overallScores.length > 0
      ? Math.round(
          overallScores.reduce((s, v) => s + v, 0) / overallScores.length,
        )
      : null;
  return {
    audits: list.length,
    completed: completed.length,
    latest_score: latest?.site_overall_score ?? null,
    latest_seo: latest?.site_seo_score ?? null,
    latest_geo: latest?.site_geo_score ?? null,
    latest_pages: latest?.pages_audited ?? null,
    latest_at: latest?.created_at ?? null,
    avg_overall: avg,
  };
});

async function load(force = false) {
  if (!props.company) return;
  error.value = null;
  if (force) refreshing.value = true;
  else loading.value = true;
  try {
    const res = await $fetch<{
      summary: Summary | null;
      cached: boolean;
      error?: string;
    }>(
      `/api/companies/${props.company.slug}/summary${force ? "?refresh=1" : ""}`,
    );
    summary.value = res.summary;
    cached.value = res.cached;
    if (!res.summary && res.error) error.value = res.error;
  } catch (e: any) {
    error.value = e?.data?.message ?? e?.message ?? "Summary unavailable";
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

watch(
  () => props.company?.slug,
  (slug) => {
    summary.value = null;
    error.value = null;
    cached.value = false;
    confirmingDelete.value = false;
    if (slug) load(false);
  },
  { immediate: true },
);

function close() {
  if (deleting.value) return;
  emit("close");
}

async function deleteCompany() {
  if (!props.company || deleting.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/companies/${props.company.slug}`, { method: "DELETE" });
    emit("deleted", props.company.slug);
    emit("close");
  } catch (e: any) {
    error.value = e?.data?.message ?? e?.message ?? "Delete failed";
    deleting.value = false;
  }
}

function scoreClass(n: number | null) {
  if (n == null) return "text-mute";
  if (n >= 70) return "text-good";
  if (n >= 40) return "text-warn";
  return "text-bad";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) close();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && open.value) close();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="chat-panel">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 px-4 backdrop-blur-sm"
        @mousedown="onBackdrop"
      >
        <div
          class="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          role="dialog"
          aria-modal="true"
          :aria-label="`Company details for ${company?.name}`"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-border bg-surface2 px-5 py-4"
          >
            <div>
              <div class="text-xs uppercase tracking-wide text-mute">
                Company
              </div>
              <h2 class="text-xl font-bold">{{ company?.name }}</h2>
              <a
                v-if="company?.domain"
                :href="`https://${company.domain}`"
                target="_blank"
                rel="noopener"
                class="text-xs text-accent hover:underline"
              >
                {{ company.domain }}
              </a>
            </div>
            <button
              class="rounded p-1 text-mute hover:bg-surface hover:text-text"
              @click="close"
              aria-label="Close"
            >
              ✕
            </button>
          </header>

          <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm">
            <!-- Stats grid -->
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div class="rounded-lg border border-border bg-surface2/40 p-3">
                <div class="text-xs uppercase tracking-wide text-mute">
                  Audits
                </div>
                <div class="mt-1 text-2xl font-semibold tabular-nums">
                  {{ stats.audits }}
                </div>
              </div>
              <div class="rounded-lg border border-border bg-surface2/40 p-3">
                <div class="text-xs uppercase tracking-wide text-mute">
                  Latest overall
                </div>
                <div
                  class="mt-1 text-2xl font-semibold tabular-nums"
                  :class="scoreClass(stats.latest_score)"
                >
                  {{ stats.latest_score ?? "—" }}
                </div>
              </div>
              <div class="rounded-lg border border-border bg-surface2/40 p-3">
                <div class="text-xs uppercase tracking-wide text-mute">
                  Latest SEO
                </div>
                <div
                  class="mt-1 text-2xl font-semibold tabular-nums"
                  :class="scoreClass(stats.latest_seo)"
                >
                  {{ stats.latest_seo ?? "—" }}
                </div>
              </div>
              <div class="rounded-lg border border-border bg-surface2/40 p-3">
                <div class="text-xs uppercase tracking-wide text-mute">
                  Latest GEO
                </div>
                <div
                  class="mt-1 text-2xl font-semibold tabular-nums"
                  :class="scoreClass(stats.latest_geo)"
                >
                  {{ stats.latest_geo ?? "—" }}
                </div>
              </div>
            </div>

            <p class="text-xs text-mute">
              Latest audit: {{ formatDate(stats.latest_at) }} ·
              {{ stats.latest_pages ?? "—" }} pages ·
              avg overall {{ stats.avg_overall ?? "—" }}
            </p>

            <!-- AI summary -->
            <section>
              <div class="mb-3 flex items-center justify-between gap-3">
                <h3 class="text-base font-semibold">AI summary</h3>
                <button
                  class="rounded-lg border border-border bg-surface2 px-3 py-1 text-xs hover:bg-surface disabled:opacity-50"
                  :disabled="loading || refreshing"
                  @click="load(true)"
                >
                  {{ refreshing ? "Refreshing…" : cached ? "Refresh" : "Regenerate" }}
                </button>
              </div>

              <div
                v-if="loading"
                class="rounded-lg border border-border bg-surface2/40 p-4 text-mute"
              >
                Generating company summary from audit data…
              </div>

              <div
                v-else-if="error && !summary"
                class="rounded-lg border border-warn/40 bg-warn/10 p-4 text-warn"
              >
                {{ error }}
              </div>

              <div
                v-else-if="summary"
                class="space-y-4 rounded-lg border border-border bg-surface2/40 p-4"
              >
                <div v-if="summary.tagline" class="text-base font-medium text-text">
                  {{ summary.tagline }}
                </div>

                <div v-if="summary.what_they_do">
                  <div
                    class="mb-1 text-xs uppercase tracking-wide text-accent"
                  >
                    What they do
                  </div>
                  <p class="leading-relaxed text-text">
                    {{ summary.what_they_do }}
                  </p>
                </div>

                <div v-if="summary.who_they_serve">
                  <div
                    class="mb-1 text-xs uppercase tracking-wide text-accent"
                  >
                    Who they serve
                  </div>
                  <p class="leading-relaxed text-text">
                    {{ summary.who_they_serve }}
                  </p>
                </div>

                <div v-if="summary.services && summary.services.length">
                  <div
                    class="mb-1 text-xs uppercase tracking-wide text-accent"
                  >
                    Services
                  </div>
                  <ul class="flex flex-wrap gap-2">
                    <li
                      v-for="s in summary.services"
                      :key="s"
                      class="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-text"
                    >
                      {{ s }}
                    </li>
                  </ul>
                </div>

                <div v-if="summary.positioning">
                  <div
                    class="mb-1 text-xs uppercase tracking-wide text-accent"
                  >
                    Positioning
                  </div>
                  <p class="leading-relaxed text-text">
                    {{ summary.positioning }}
                  </p>
                </div>

                <div
                  v-if="
                    summary.things_to_know && summary.things_to_know.length
                  "
                >
                  <div
                    class="mb-1 text-xs uppercase tracking-wide text-accent"
                  >
                    Things to know
                  </div>
                  <ul class="ml-5 list-disc space-y-1 text-text">
                    <li v-for="t in summary.things_to_know" :key="t">
                      {{ t }}
                    </li>
                  </ul>
                </div>

                <p
                  v-if="summary.generated_at"
                  class="border-t border-border pt-3 text-xs text-mute"
                >
                  Generated {{ formatDate(summary.generated_at) }}
                  <span v-if="cached"> · cached</span>
                </p>
              </div>
            </section>
          </div>

          <footer
            class="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface2 px-5 py-3"
          >
            <NuxtLink
              v-if="company"
              :to="`/companies/${company.slug}`"
              class="text-sm text-accent hover:underline"
              @click="close"
            >
              View full audit history →
            </NuxtLink>

            <div class="flex items-center gap-2">
              <template v-if="!confirmingDelete">
                <button
                  class="rounded-lg border border-bad/40 bg-bad/15 px-3 py-1.5 text-xs font-semibold text-bad hover:bg-bad/25"
                  :disabled="deleting"
                  @click="confirmingDelete = true"
                >
                  Delete company
                </button>
              </template>
              <template v-else>
                <span class="text-xs text-warn">
                  Delete {{ company?.name }} and all
                  {{ stats.audits }} audit{{ stats.audits === 1 ? "" : "s" }}?
                </span>
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
                  @click="deleteCompany"
                >
                  {{ deleting ? "Deleting…" : "Yes, delete" }}
                </button>
              </template>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
