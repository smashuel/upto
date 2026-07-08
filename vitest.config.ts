import { defineConfig, configDefaults } from 'vitest/config';

// Scoped to the map services for now — src/utils/lifecycleReducer.test.ts and
// triplink-lifecycle.test.js predate Vitest and still run under `node --test`
// (see the `test` script). Widen the include when/if those migrate.
export default defineConfig({
  test: {
    include: ['src/services/**/*.test.ts'],
    // mapFraming.test.ts is a pure `node --test` seam (Cesium-free) that happens to
    // live under src/services/. It uses node:test, not Vitest — run only by the
    // `node --test` half of the `test` script; keep Vitest from mis-collecting it.
    exclude: [...configDefaults.exclude, 'src/services/mapFraming.test.ts'],
    environment: 'node',
  },
});
