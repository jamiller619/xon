import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:32400',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && !res.writableEnded) {
              res.writeHead(503)
              res.end()
            }
          })
        },
      },
    },
  },
  build: {
    outDir: 'dist/client',
    manifest: true,
  },
})
