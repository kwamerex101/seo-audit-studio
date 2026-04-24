<script setup lang="ts">
type PageRow = {
  url: string;
  title?: string | null;
  type?: string;
  score?: number;
  technical?: number;
  on_page?: number;
  content?: number;
  links?: number;
  schema?: number;
  geo?: number;
  json_ld_types?: string[];
  has_h1?: boolean;
  meta_description?: string | null;
  meta_description_length?: number;
  title_length?: number;
  issues?: string[];
};

const props = defineProps<{ pages: PageRow[] }>();

type SortKey = "score" | "url" | "technical" | "on_page" | "content" | "links" | "schema" | "geo";
const sortKey = ref<SortKey>("score");
const sortDir = ref<"asc" | "desc">("asc");
const filter = ref("");
const openIndex = ref<number | null>(null);

const rows = computed(() => {
  const q = filter.value.toLowerCase().trim();
  const list = q
    ? props.pages.filter(
        (p) =>
          p.url.toLowerCase().includes(q) ||
          (p.title ?? "").toLowerCase().includes(q),
      )
    : props.pages;
  const dir = sortDir.value === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let cmp = 0;
    const k = sortKey.value;
    if (k === "url") cmp = (a.url || "").localeCompare(b.url || "");
    else cmp = (Number(a[k] ?? 0) - Number(b[k] ?? 0));
    return cmp * dir;
  });
});

function toggleSort(k: SortKey) {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = k;
    sortDir.value = k === "url" ? "asc" : "asc";
  }
}
function arrow(k: SortKey) {
  if (sortKey.value !== k) return "";
  return sortDir.value === "asc" ? " ▲" : " ▼";
}

function scoreClass(n: number | undefined) {
  if (n === undefined) return "text-mute";
  if (n >= 70) return "text-good";
  if (n >= 40) return "text-warn";
  return "text-bad";
}

function toggleDrawer(i: number) {
  openIndex.value = openIndex.value === i ? null : i;
}

function shortUrl(u: string) {
  try {
    const p = new URL(u).pathname;
    return p === "/" ? "/" : p;
  } catch {
    return u;
  }
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex items-center justify-between gap-4">
      <h2 class="text-lg font-semibold">Pages ({{ pages.length }})</h2>
      <input
        v-model="filter"
        placeholder="Filter by URL or title…"
        class="w-64 rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase tracking-wide text-mute">
          <tr class="border-b border-border">
            <th class="cursor-pointer pb-2 font-medium hover:text-text" @click="toggleSort('url')">
              URL<span class="text-accent">{{ arrow("url") }}</span>
            </th>
            <th class="cursor-pointer pb-2 font-medium hover:text-text" @click="toggleSort('score')">
              Score<span class="text-accent">{{ arrow("score") }}</span>
            </th>
            <th class="cursor-pointer pb-2 font-medium hover:text-text" @click="toggleSort('technical')">
              Tech<span class="text-accent">{{ arrow("technical") }}</span>
            </th>
            <th class="cursor-pointer pb-2 font-medium hover:text-text" @click="toggleSort('on_page')">
              On-Page<span class="text-accent">{{ arrow("on_page") }}</span>
            </th>
            <th class="cursor-pointer pb-2 font-medium hover:text-text" @click="toggleSort('content')">
              Content<span class="text-accent">{{ arrow("content") }}</span>
            </th>
            <th class="cursor-pointer pb-2 font-medium hover:text-text" @click="toggleSort('links')">
              Links<span class="text-accent">{{ arrow("links") }}</span>
            </th>
            <th class="cursor-pointer pb-2 font-medium hover:text-text" @click="toggleSort('schema')">
              Schema<span class="text-accent">{{ arrow("schema") }}</span>
            </th>
            <th class="cursor-pointer pb-2 font-medium hover:text-text" @click="toggleSort('geo')">
              GEO<span class="text-accent">{{ arrow("geo") }}</span>
            </th>
            <th class="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(p, i) in rows" :key="p.url">
            <tr
              class="cursor-pointer border-b border-border/60 hover:bg-surface2/60"
              @click="toggleDrawer(i)"
            >
              <td class="max-w-xs truncate py-2 text-text">{{ shortUrl(p.url) }}</td>
              <td class="py-2 font-semibold" :class="scoreClass(p.score)">
                {{ p.score ?? "—" }}
              </td>
              <td class="py-2" :class="scoreClass(p.technical)">{{ p.technical ?? "—" }}</td>
              <td class="py-2" :class="scoreClass(p.on_page)">{{ p.on_page ?? "—" }}</td>
              <td class="py-2" :class="scoreClass(p.content)">{{ p.content ?? "—" }}</td>
              <td class="py-2" :class="scoreClass(p.links)">{{ p.links ?? "—" }}</td>
              <td class="py-2" :class="scoreClass(p.schema)">{{ p.schema ?? "—" }}</td>
              <td class="py-2" :class="scoreClass(p.geo)">{{ p.geo ?? "—" }}</td>
              <td class="py-2 text-right text-mute">
                {{ openIndex === i ? "▾" : "▸" }}
              </td>
            </tr>
            <tr v-if="openIndex === i" class="border-b border-border/60 bg-surface2/30">
              <td colspan="9" class="px-4 py-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <div class="mb-1 text-xs uppercase tracking-wide text-accent">
                      URL
                    </div>
                    <a
                      :href="p.url"
                      target="_blank"
                      rel="noopener"
                      class="break-all text-sm text-accent hover:underline"
                      >{{ p.url }}</a
                    >
                  </div>
                  <div>
                    <div class="mb-1 text-xs uppercase tracking-wide text-accent">
                      Title ({{ p.title_length ?? 0 }})
                    </div>
                    <div class="text-sm">{{ p.title || "—" }}</div>
                  </div>
                  <div>
                    <div class="mb-1 text-xs uppercase tracking-wide text-accent">
                      Meta description ({{ p.meta_description_length ?? 0 }})
                    </div>
                    <div class="text-sm text-mute">
                      {{ p.meta_description || "—" }}
                    </div>
                  </div>
                  <div>
                    <div class="mb-1 text-xs uppercase tracking-wide text-accent">
                      JSON-LD types
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <span
                        v-for="t in p.json_ld_types ?? []"
                        :key="t"
                        class="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-text"
                        >{{ t }}</span
                      >
                      <span
                        v-if="(p.json_ld_types ?? []).length === 0"
                        class="text-xs text-mute"
                        >None</span
                      >
                    </div>
                  </div>
                  <div v-if="p.issues && p.issues.length > 0" class="md:col-span-2">
                    <div class="mb-1 text-xs uppercase tracking-wide text-accent">
                      Issues
                    </div>
                    <ul class="list-disc pl-5 text-sm text-mute">
                      <li v-for="(iss, idx) in p.issues" :key="idx">{{ iss }}</li>
                    </ul>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="rows.length === 0">
            <td colspan="9" class="py-4 text-center text-mute">
              No pages match the filter.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
