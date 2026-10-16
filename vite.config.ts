import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves a project site from /<repo>/; the Pages workflow sets BASE_PATH (D-029).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        animation: fileURLToPath(new URL('./tools/animation.html', import.meta.url)),
      },
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('rapier')) return 'rapier';
          return undefined;
        },
      },
    },
  },
  server: { strictPort: true },
  preview: { strictPort: true },
  esbuild: { target: 'es2022' },
});
