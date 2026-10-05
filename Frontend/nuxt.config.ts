// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@norbiros/nuxt-auto-form',
    '@pinia/nuxt',
    '@nuxt/eslint',
    '@nuxt/ui'
  ],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },
  ui: {
    theme: {
      colors: ['primary', 'success', 'warning', 'error', 'info'],
    },
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL,
    },
  },
})