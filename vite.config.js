// Vite settings. Output goes to dist/, which Cloudflare serves as plain static files.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    target: "es2022",
    // Pyodide (public/pyodide) is copied as-is; this only warns about our own bundles.
    chunkSizeWarningLimit: 400,
  },
  worker: { format: "es" },
});
