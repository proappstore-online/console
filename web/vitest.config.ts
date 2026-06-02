import { defineConfig } from 'vitest/config'

// Unit tests only (pure logic). E2E lives in e2e/ and runs under Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
