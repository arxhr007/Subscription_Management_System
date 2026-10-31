export default defineNuxtConfig({
  compatibilityDate: '2026-10-31',
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  ui: { fonts: false },
  runtimeConfig: { apiOrigin: 'http://127.0.0.1:4000' },
  app: { head: { title: 'Brightloop · Subscription workspace', meta: [{ name: 'description', content: 'Subscriptions, recurring billing and revenue in one workspace.' }] } },
  typescript: { strict: true },
})
