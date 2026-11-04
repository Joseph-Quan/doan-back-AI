import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: '../../public',
    emptyOutDir: false,
    rollupOptions: { input: 'src/client/index.html' }
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' }
  }
});
