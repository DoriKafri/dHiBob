import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()] as any,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next'],
    coverage: { provider: 'v8', reporter: ['text', 'json', 'html'] },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
