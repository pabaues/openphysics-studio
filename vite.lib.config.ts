import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/lib/openphysics.ts'),
      formats: ['es'],
      fileName: () => 'openphysics.js',
    },
  },
})
