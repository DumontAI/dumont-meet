/// <reference types="vite/client" />

// Version of @mediapipe/tasks-vision, injected at build time (vite.config.ts).
declare const __MEDIAPIPE_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_TITLE: string
  // Product name drawn next to the logo mark in the header. Optional: when it
  // is empty the logo asset is expected to be a full lockup and carries the
  // title on its own.
  readonly VITE_APP_WORDMARK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
