import { defineConfig } from 'vite';

export default defineConfig({
  // Use project root so imports resolve correctly
  root: '.',
  // Dev server settings
  server: {
    open: '/examples/',  // Auto-open examples index
  },
});
