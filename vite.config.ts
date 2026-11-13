import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works under GitHub Pages' /<repo>/ sub-path.
  base: './',
  test: {
    environment: 'node',
  },
});
