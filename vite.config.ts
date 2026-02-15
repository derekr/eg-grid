import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  base: '/eg-grid/',
  server: {
    open: '/examples/',
  },
  build: {
    outDir: 'dist/site',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'examples/index': resolve(import.meta.dirname, 'examples/index.html'),
        'examples/web-component': resolve(import.meta.dirname, 'examples/web-component.html'),
        'examples/frameworks': resolve(import.meta.dirname, 'examples/frameworks.html'),
      },
    },
  },
});
