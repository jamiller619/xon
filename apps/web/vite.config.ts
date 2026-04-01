import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:32400',
    },
  },
  build: {
    outDir: 'dist/client',
    manifest: true,
  },
});
