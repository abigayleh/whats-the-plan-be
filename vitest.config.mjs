import { defineConfig } from 'vitest/config';

// Backend is CommonJS; this config is .mjs so it loads as ESM regardless of package type.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.js'],
    clearMocks: true,
    coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['src/**/*.js'] },
  },
});