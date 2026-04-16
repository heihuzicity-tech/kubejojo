import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const outDir = process.env.KUBEJOJO_WEB_OUT_DIR || 'dist';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
