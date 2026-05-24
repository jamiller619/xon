import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [react(), dts()],
  build: {
    target: 'es2022',
    lib: {
      entry: 'src/index.ts',
      name: 'XonUI',
      fileName: 'xon.ui',
      formats: ['es'],
    },
    rolldownOptions: {
      external: ['react', 'react-dom'],
    },
  },
})
