import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static build (dist/) — host on any static host (Netlify, Cloudflare Pages, Vercel, S3...).
// base "./" keeps asset paths relative so it also works from a sub-folder.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { rollupOptions: { input: { main: "index.html", share: "share.html" } } },
});
