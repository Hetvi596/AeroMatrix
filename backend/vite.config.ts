import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    host: true,
  },
  define: {
    // Cesium loads workers/assets from here (copied by scripts/copy-cesium.mjs)
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
