<script setup lang="ts">
import type { ChatMessage } from "~~/server/lib/report/schema";
import { renderMarkdown } from "~/utils/md";

const props = defineProps<{
  auditId: string;
}>();

const open = ref(false);
const input = ref("");
const sending = ref(false);
const messages = ref<ChatMessage[]>([]);
const aiConfigured = ref(true);
const streamingText = ref("");
const errorText = ref<string | null>(null);
const scroller = ref<HTMLElement | null>(null);

// Copy chat history
const copied = ref(false);
function copyHistory() {
  if (!messages.value.length) return;
  const text = messages.value
    .map((m) => `${m.role === "user" ? "You" : "Assistant"}:\n${m.content}`)
    .join("\n\n---\n\n");
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  });
}

// Scroll-to-top button
const showScrollTop = ref(false);
function onScroll() {
  if (!scroller.value) return;
  showScrollTop.value = scroller.value.scrollTop > 120;
}
function scrollToTop() {
  scroller.value?.scrollTo({ top: 0, behavior: "smooth" });
}

// Context panel
const contextOpen = ref(false);
const contextText = ref("");
const contextSaving = ref(false);
const contextSaved = ref(false);

async function loadContext() {
  try {
    const res = await $fetch<{ context: string }>(`/api/audits/${props.auditId}/context`);
    contextText.value = res.context;
  } catch {
    // ignore
  }
}

async function saveContext() {
  if (contextSaving.value) return;
  contextSaving.value = true;
  try {
    await $fetch(`/api/audits/${props.auditId}/context`, {
      method: "POST",
      body: { text: contextText.value },
    });
    contextSaved.value = true;
    setTimeout(() => (contextSaved.value = false), 2000);
  } catch {
    // ignore
  } finally {
    contextSaving.value = false;
  }
}

async function clearContext() {
  contextText.value = "";
  await saveContext();
}

async function loadConversation() {
  try {
    const res = await $fetch<{
      conversation: { messages: ChatMessage[] };
      ai_configured: boolean;
    }>(`/api/audits/${props.auditId}/chat`);
    messages.value = res.conversation.messages;
    aiConfigured.value = res.ai_configured;
  } catch {
    // ignore — widget works as empty
  }
}

onMounted(() => {
  loadConversation();
  loadContext();
});

async function scrollToBottom() {
  await nextTick();
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight;
  }
}

async function send() {
  const text = input.value.trim();
  if (!text || sending.value) return;
  errorText.value = null;
  sending.value = true;
  streamingText.value = "";
  messages.value.push({
    id: `local-${Date.now()}`,
    role: "user",
    content: text,
    created_at: new Date().toISOString(),
    citations: [],
  });
  input.value = "";
  await scrollToBottom();

  try {
    const response = await fetch(`/api/audits/${props.auditId}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        let event: any;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (event.type === "delta") {
          streamingText.value += event.text ?? "";
          await scrollToBottom();
        } else if (event.type === "done") {
          messages.value.push(event.message);
          streamingText.value = "";
        } else if (event.type === "error") {
          errorText.value = event.message ?? "Stream error";
        }
      }
    }
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : String(err);
  } finally {
    sending.value = false;
    await scrollToBottom();
  }
}
</script>

<template>
  <div class="fixed bottom-5 right-5 z-50">
    <Transition name="chat-panel">
      <button
        v-if="!open"
        key="trigger"
        class="flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-bg shadow-lg transition-transform duration-150 hover:scale-105 hover:bg-accent/90"
        @click="open = true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        <span>Ask about this audit</span>
      </button>
    </Transition>

    <Transition name="chat-panel">
      <div
        v-if="open"
        key="panel"
        class="flex h-[600px] w-[420px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-border bg-surface2 px-4 py-3">
        <div>
          <div class="text-sm font-semibold">Audit Q&amp;A</div>
          <div class="text-xs text-mute">AI-powered · report-aware</div>
        </div>
        <div class="flex items-center gap-1">
          <!-- Copy history -->
          <button
            v-if="messages.length > 0"
            class="rounded p-1.5 text-mute hover:bg-surface hover:text-text"
            :class="copied ? 'text-good' : ''"
            :title="copied ? 'Copied!' : 'Copy chat history'"
            @click="copyHistory"
            aria-label="Copy chat history"
          >
            <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
          <!-- Context / system prompt -->
          <button
            class="rounded p-1.5 text-mute hover:bg-surface hover:text-text"
            :class="contextOpen ? 'text-accent bg-accent/10' : ''"
            title="Audit context / system prompt"
            @click="contextOpen = !contextOpen"
            aria-label="Toggle context"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 0 1 1.4 13.4M4.93 4.93a10 10 0 0 0-1.4 13.4M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
          <button
            class="rounded p-1 text-mute hover:bg-surface hover:text-text"
            @click="open = false"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Context panel -->
      <Transition name="ctx-slide">
        <div v-if="contextOpen" class="border-b border-border bg-surface2/60 px-4 py-3">
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-xs font-semibold text-text">Audit context</span>
            <span v-if="contextSaved" class="text-[10px] text-good">Saved ✓</span>
          </div>
          <p class="mb-2 text-[11px] text-mute leading-relaxed">
            Extra info sent as system context with every message — e.g. CMS, plugins, team goals.
          </p>
          <textarea
            v-model="contextText"
            rows="4"
            placeholder="e.g. Site runs WordPress 6.4 with Yoast SEO Premium. The main goal is to rank for local B2B keywords in Ghana. The dev team can deploy changes weekly."
            class="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text placeholder-mute outline-none focus:border-accent"
          />
          <div class="mt-2 flex gap-2">
            <button
              class="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:bg-accent/90 disabled:opacity-50"
              :disabled="contextSaving"
              @click="saveContext"
            >
              {{ contextSaving ? "Saving…" : "Save" }}
            </button>
            <button
              class="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-mute hover:text-text"
              @click="clearContext"
            >
              Clear
            </button>
          </div>
        </div>
      </Transition>

      <div
        v-if="!aiConfigured"
        class="border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn"
      >
        No AI provider reachable. Start Osaurus, claude_local_api, or cursor-api.
      </div>

      <div
        ref="scroller"
        class="relative flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm"
        @scroll="onScroll"
      >
        <!-- Scroll to top -->
        <Transition name="fade-up">
          <button
            v-if="showScrollTop"
            class="sticky top-1 z-10 ml-auto flex items-center gap-1 rounded-full border border-border bg-surface2/95 px-2.5 py-1 text-[11px] text-mute shadow backdrop-blur hover:text-text"
            @click="scrollToTop"
            aria-label="Scroll to top"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" aria-hidden="true">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
            Top
          </button>
        </Transition>
        <div
          v-if="messages.length === 0 && !streamingText"
          class="space-y-2 text-mute"
        >
          <p>Try asking:</p>
          <ul class="list-disc pl-5 text-xs">
            <li>Which page has the weakest GEO score and why?</li>
            <li>What keywords should the /services page target?</li>
            <li>Give me a Yoast-ready meta description for the homepage.</li>
            <li>What's the single most critical fix on this site?</li>
          </ul>
        </div>
        <div
          v-for="m in messages"
          :key="m.id"
          :class="[
            'max-w-[90%] rounded-lg px-3 py-2',
            m.role === 'user'
              ? 'ml-auto whitespace-pre-wrap bg-accent/15 text-text'
              : 'chat-md bg-surface2 text-text',
          ]"
        >
          <template v-if="m.role === 'user'">{{ m.content }}</template>
          <span v-else v-html="renderMarkdown(m.content)" />
        </div>
        <div
          v-if="streamingText"
          class="chat-md max-w-[90%] rounded-lg bg-surface2 px-3 py-2 text-text"
        >
          <span v-html="renderMarkdown(streamingText)" />
          <span class="ml-0.5 inline-block animate-pulse">▍</span>
        </div>
        <div
          v-if="errorText"
          class="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad"
        >
          {{ errorText }}
        </div>
      </div>

      <form
        class="flex items-center gap-2 border-t border-border bg-surface2 px-3 py-3"
        @submit.prevent="send"
      >
        <input
          v-model="input"
          type="text"
          placeholder="Ask a question about this audit…"
          class="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          :disabled="sending || !aiConfigured"
        />
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/40"
          :disabled="sending || !input.trim() || !aiConfigured"
        >
          Send
        </button>
      </form>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ctx-slide-enter-active,
.ctx-slide-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
  max-height: 300px;
}
.ctx-slide-enter-from,
.ctx-slide-leave-to {
  max-height: 0;
  opacity: 0;
}

.fade-up-enter-active,
.fade-up-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
