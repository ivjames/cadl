import { defineConfig } from "vite";

export default defineConfig({
  // Served at the root of its own lab980 subdomain (cadl.lab980.com), so assets
  // resolve from "/" rather than the old GitHub Pages "/cadl/" project path.
  base: "/",
  build: {
    // Babylon dominates the bundle; emitting ~24 MB of sourcemaps for minified
    // engine code isn't worth the build-time cost. Switch to "hidden" if error
    // tracking ever needs maps without shipping the reference comment.
    sourcemap: false,
    // The Babylon vendor chunk is inherently large; don't warn on its size.
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        // Pin the engine to its own long-lived chunk: app-code edits then keep
        // the same hash, so a returning iPad reuses the cached Babylon file
        // instead of re-downloading it every deploy. Function form matches the
        // deep-import module paths (e.g. @babylonjs/core/Engines/engine).
        manualChunks(id) {
          if (id.includes("node_modules/@babylonjs")) return "babylon";
        },
      },
    },
  },
});
