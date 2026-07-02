import { defineConfig } from 'vitest/config';

// Scoped to the map services for now — src/utils/lifecycleReducer.test.ts and
// triplink-lifecycle.test.js predate Vitest and still run under `node --test`
// (see the `test` script). Widen the include when/if those migrate.
export default defineConfig({
  test: {
    include: ['src/services/**/*.test.ts'],
    environment: 'node',
  },
});
