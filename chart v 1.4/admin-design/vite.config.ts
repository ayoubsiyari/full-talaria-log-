import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = process.env.CHART_BACKEND || "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  base: "/chart/dist-admin/",
  server: {
    port: 5174,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/journal": { target: BACKEND, changeOrigin: true },
      "/ws": { target: BACKEND, changeOrigin: true, ws: true },
      "/auth": { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../chart/dist-admin"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/admin-[hash].js",
        chunkFileNames: "assets/chunk-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
