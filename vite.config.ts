/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global available to the Vite config only
const host: string | undefined = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Keep Rust compiler errors on screen during `tauri dev`.
  clearScreen: false,
  server: {
    // Tauri points at a fixed port; failing loudly beats silently serving elsewhere.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  // The macOS WKWebView is the only target, so we can build for a modern Safari.
  build: {
    target: "safari14",
    sourcemap: false,
    // The bundle ships inside the .app and loads from disk, so the usual
    // network-oriented size warning does not apply. CodeMirror and
    // highlight.js account for most of it.
    chunkSizeWarningLimit: 1500,
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
