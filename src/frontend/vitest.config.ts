import { fileURLToPath, URL } from 'node:url'

import { configDefaults, defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so the tests load none of the build plugins.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    tsconfigPaths: true,
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      'src/features/rooms/livekit/hooks/reconnectMediaGuard.test.ts',
      'src/features/rooms/livekit/hooks/poorConnectionFallback.test.ts',
    ],
  },
})
