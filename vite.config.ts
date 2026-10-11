import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Task 2 model service (backend/task2_model, 127.0.0.1 only). The browser reaches only its
// read-only replay endpoints, same-origin through this proxy; /task2/predict is not exposed.
const TASK2_TARGET = process.env.TASK2_API_TARGET || 'http://127.0.0.1:8030';
const task2Proxy = { '^/task2/(health|stations|models|cases|replay|evaluation|demos|plan)': { target: TASK2_TARGET, changeOrigin: false } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Cesium loads workers/assets from here (copied by scripts/copy-cesium.mjs)
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  build: {
    chunkSizeWarningLimit: 6000,
  },
  server: { proxy: task2Proxy },
  preview: { proxy: task2Proxy },
});
