import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // @xenova/transformers imports onnxruntime-node in Electron's renderer (Node-like env).
      // Redirect to onnxruntime-web (WASM) which works correctly in the browser context.
      'onnxruntime-node': 'onnxruntime-web',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

