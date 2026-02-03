import { defineConfig } from 'vite';

export default defineConfig({
  // Use project root
  root: '.',
  // Dev server settings
  server: {
    open: '/example.html',  // Auto-open on start
  },
});
