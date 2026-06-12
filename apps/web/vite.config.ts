import react from '@vitejs/plugin-react'
import { inlineCssModules } from 'inline-css-modules/vite'
import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    inlineCssModules(),
    analyzer({
      analyzerMode: 'static',
      // biome-ignore lint/suspicious/noExplicitAny: build tool
    }) as any,
  ],
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
