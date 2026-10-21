import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  root: __dirname,
  envDir: false,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '../../src') } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: { host: '127.0.0.1', port: 4204, strictPort: true }
});
