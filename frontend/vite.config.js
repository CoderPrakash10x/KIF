
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,

    proxy: {
      // Forward frontend API requests to the Express backend.
      '/api': {
        target: process.env.DEV_API_TARGET || 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});