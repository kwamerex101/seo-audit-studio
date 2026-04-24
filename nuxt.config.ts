export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: true },
  modules: ["@nuxtjs/tailwindcss", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  typescript: {
    strict: true,
    typeCheck: false,
  },
  experimental: {
    appManifest: false,
  },
  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    dataDir: process.env.DATA_DIR ?? "",
    legacyOutputsDir: process.env.LEGACY_OUTPUTS_DIR ?? "",
  },
  app: {
    head: {
      title: "SEO Audit Studio",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
    },
  },
});
