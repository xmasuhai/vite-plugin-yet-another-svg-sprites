import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: true,
    ssr: 'src/index.ts',
    rollupOptions: {
      external: ['vite', 'svgo', 'svgstore'],
    },
  },
})