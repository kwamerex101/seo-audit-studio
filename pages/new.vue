<script setup lang="ts">
const router = useRouter();
const url = ref("");
const countries = ref("");
const maxPages = ref(0); // 0 = "all sitemap URLs"
const submitting = ref(false);
const error = ref<string | null>(null);

async function submit() {
  if (submitting.value) return;
  error.value = null;
  submitting.value = true;
  try {
    const countriesArr = countries.value
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const res = await $fetch<{
      job_id: string;
      audit_id: string;
      company_slug: string;
    }>("/api/audits", {
      method: "POST",
      body: {
        url: url.value.trim(),
        countries: countriesArr,
        max_pages: Number(maxPages.value) || 0,
      },
    });
    await router.push(`/audits/${res.audit_id}?job=${res.job_id}`);
  } catch (err: any) {
    error.value =
      err?.data?.statusMessage ?? err?.message ?? "Failed to start audit.";
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <div class="mb-6">
      <NuxtLink to="/" class="text-sm text-mute hover:text-text">← Dashboard</NuxtLink>
    </div>
    <h1 class="mb-2 text-2xl font-bold">Run a new audit</h1>
    <p class="mb-6 text-mute">
      Enter a URL. The audit runs in the background — you'll see live progress
      on the report page and can navigate away at any time.
    </p>

    <form class="card max-w-xl space-y-4" @submit.prevent="submit">
      <label class="block text-sm">
        <span class="mb-1 block text-mute">Site URL</span>
        <input
          v-model="url"
          type="url"
          required
          placeholder="https://example.com"
          class="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-mute">
          Target countries (optional, comma-separated ISO codes)
        </span>
        <input
          v-model="countries"
          type="text"
          placeholder="GH, US"
          class="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-mute">
          Page cap (optional)
        </span>
        <input
          v-model.number="maxPages"
          type="number"
          min="0"
          max="5000"
          placeholder="0"
          class="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span class="mt-1 block text-xs text-mute">
          Leave at <strong class="text-text">0</strong> to crawl
          <strong class="text-text">every URL</strong> in the site's sitemap.
          Set a number to cap the audit (also caps the BFS fallback when no
          sitemap is found).
        </span>
      </label>

      <p v-if="error" class="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
        {{ error }}
      </p>

      <button
        type="submit"
        :disabled="submitting || !url"
        class="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/40"
      >
        <span
          v-if="submitting"
          class="h-3 w-3 animate-spin rounded-full border-2 border-bg/40 border-t-bg"
        />
        {{ submitting ? "Kicking off audit…" : "Start audit" }}
      </button>
    </form>
  </div>
</template>
