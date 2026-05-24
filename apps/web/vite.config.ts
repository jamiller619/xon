import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:6019',
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
    target: 'es2022',
    outDir: 'dist/client',
    manifest: true,
  },
})
