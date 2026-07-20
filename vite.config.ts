import { defineConfig } from "vite";

export default defineConfig({
  // Served at the root of its own lab980 subdomain (cadl.lab980.com), so assets
  // resolve from "/" rather than the old GitHub Pages "/cadl/" project path.
  base: "/",
  build: {
    sourcemap: true,
  },
});
