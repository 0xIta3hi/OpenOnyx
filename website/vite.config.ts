import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const appRoot = path.resolve(__dirname, "..");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "src"),
      "onnxruntime-node": "onnxruntime-web",
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 4173,
    strictPort: true,
    fs: { allow: [appRoot] },
  },
  optimizeDeps: {
    exclude: ["electron"],
  },
  worker: {
    format: "es",
  },
});
