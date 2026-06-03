import { defineConfig } from 'vitest/config'

// Unit + hook tests. E2E lives in e2e/ and runs under Playwright.
// Default env is node (fast, for pure logic); hook/component tests opt into jsdom
// per file with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
