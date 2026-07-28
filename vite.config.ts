/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    passWithNoTests: true,
    setupFiles: ['./src/test/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
})
