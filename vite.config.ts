import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  build: {
    emptyOutDir: true,
    ssr: 'src/index.ts',
    rollupOptions: {
      external: ['vite', 'svgo', 'svgstore', 'css-tree'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@src': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
