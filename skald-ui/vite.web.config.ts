// Standalone web build of the renderer (no Electron Forge in the loop).
// Output lands in dist-web/, served by web-server/server.mjs.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.web.html',
    },
  },
});
