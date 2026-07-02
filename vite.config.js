import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: './', // This directs the build output to the root folder instead of /dist
    emptyOutDir: false, // CRUCIAL: Prevents Vite from deleting your source files (like src/ or package.json) when rebuilding
  },
});
