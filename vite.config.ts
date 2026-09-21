import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // three.js changes rarely; give it its own long-cached chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          atlas: ["world-atlas/land-110m.json", "topojson-client"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
