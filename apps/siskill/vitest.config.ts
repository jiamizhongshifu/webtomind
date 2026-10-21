import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/siskill/worker.test.mjs',
      'src/__tests__/siskill-commerce-*.test.ts'
    ],
    maxWorkers: 1
  }
});
