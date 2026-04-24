<script setup lang="ts">
const url = ref("");
const countries = ref("");
</script>

<template>
  <div>
    <div class="mb-6">
      <NuxtLink to="/" class="text-sm text-mute hover:text-text">← Dashboard</NuxtLink>
    </div>
    <h1 class="mb-2 text-2xl font-bold">Run a new audit</h1>
    <p class="mb-6 text-mute">
      Enter a URL. The app will discover the sitemap, crawl every page, and
      score against the SEO + GEO checklist.
    </p>

    <form class="card max-w-xl space-y-4" @submit.prevent>
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
        <span class="mb-1 block text-mute">Target countries (optional, comma-separated ISO codes)</span>
        <input
          v-model="countries"
          type="text"
          placeholder="GH, US"
          class="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <button
        type="button"
        disabled
        class="w-full cursor-not-allowed rounded-lg bg-accent/40 px-4 py-2 text-sm font-semibold text-bg"
        title="Crawler + scoring pipeline lands in Phase 2"
      >
        Start audit (available after Phase 2)
      </button>
    </form>

    <div class="mt-6 rounded-lg border border-dashed border-border p-6 text-sm text-mute">
      Phase 1 ships the data layer and legacy-outputs migration. The crawler
      and background scoring pipeline come online in Phase 2.
    </div>
  </div>
</template>
