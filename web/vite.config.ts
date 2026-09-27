/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { roomflowApi } from './server/api'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), roomflowApi()],
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
})
