/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { recognitionPlugin } from './server/recognitionPlugin.ts'
import { DEFAULT_MODEL } from './server/recognition.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  return {
  plugins: [react(), tailwindcss(), recognitionPlugin({ key: env.GEMINI_API_KEY ?? '', paid: env.GEMINI_PAID_PROJECT === 'true', model: env.GEMINI_MODEL || DEFAULT_MODEL })],
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
  }
})
