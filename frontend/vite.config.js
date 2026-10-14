import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Dev: the browser talks to :5173 only; /api is forwarded to the backend (same-origin => cookies just work).
      proxy: { '/api': { target: env.DEV_API_TARGET || 'http://localhost:5001', changeOrigin: false } },
    },
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.js'] },
    build: { sourcemap: false, chunkSizeWarningLimit: 400 },
  };
});
