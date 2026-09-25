import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['api/utils/media-storage/**/*.test.ts']
  }
});
