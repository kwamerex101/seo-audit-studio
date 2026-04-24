<script setup lang="ts">
const route = useRoute();
const nav = [
  { label: "Dashboard", to: "/" },
  { label: "Reports", to: "/reports" },
  { label: "New audit", to: "/new" },
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
          class="rounded-lg px-3 py-2 text-sm transition"
          :class="
            route.path === item.to
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
