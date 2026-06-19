import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handoffRoot = path.resolve(__dirname, "..");

const fullReloadTalariaMonolith = () => ({
  name: "full-reload-talaria-v16",
  handleHotUpdate(ctx) {
    if (ctx.file.endsWith("TalariaV16.jsx") || ctx.file.endsWith("scoreEngine.js")) {
      ctx.server.ws.send({ type: "full-reload" });
      return [];
    }
  },
});

/** Static export for `/talaria-v16-design/` — reads TalariaV16.jsx from parent folder unchanged. */
export default defineConfig({
  plugins: [fullReloadTalariaMonolith(), react()],
  base: "/talaria-v16-design/",
  resolve: {
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      reactflow: path.resolve(__dirname, "node_modules/reactflow"),
    },
  },
  server: {
    fs: { allow: [handoffRoot] },
  },
  build: {
    outDir: path.resolve(__dirname, "../../homepage/public/talaria-v16-design"),
    emptyOutDir: true,
  },
});
