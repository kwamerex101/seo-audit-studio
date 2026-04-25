<script setup lang="ts">
const route = useRoute();
const nav = [
  { label: "Dashboard", to: "/", match: (p: string) => p === "/" },
  {
    label: "Reports",
    to: "/reports",
    // Reports lights up for /reports, /audits/<id>, and /companies/<slug>
    match: (p: string) =>
      p.startsWith("/reports") ||
      p.startsWith("/audits") ||
      p.startsWith("/companies"),
  },
  { label: "New audit", to: "/new", match: (p: string) => p.startsWith("/new") },
  { label: "Settings", to: "/settings", match: (p: string) => p.startsWith("/settings") },
];
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      class="flex w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6"
    >
      <div class="mb-8 flex items-center gap-2">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent"
        >
          <span class="font-bold">S</span>
        </div>
        <div>
          <div class="text-sm font-semibold">SEO Audit</div>
          <div class="text-xs text-mute">Studio</div>
        </div>
      </div>
      <nav class="flex flex-col gap-1">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="rounded-lg px-3 py-2 text-sm transition-colors"
          :class="
            item.match(route.path)
              ? 'bg-surface2 text-text'
              : 'text-mute hover:bg-surface2/60 hover:text-text'
          "
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
      <div class="mt-auto text-xs text-mute">Single-user · Local</div>
    </aside>
    <main class="flex-1 overflow-x-hidden px-8 py-8">
      <slot />
    </main>
  </div>
</template>
