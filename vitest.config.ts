import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Markdown tests must not fetch remote images for their sizes.
    env: { SKIP_IMAGE_PROBE: '1' },
  },
});
