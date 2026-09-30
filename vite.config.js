import { defineConfig } from 'vite';

// base 使用相对路径，便于部署到 GitHub Pages 等子路径
export default defineConfig({
  base: './',
  server: {
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': { target: 'http://localhost:3000' },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
  worker: {
    format: 'es',
  },
});
