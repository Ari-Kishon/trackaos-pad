import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    assetsDir: 'app',
    target: 'es2022',
    cssCodeSplit: true,
    cssMinify: true,
    minify: true,
    sourcemap: false,
    reportCompressedSize: true,
    modulePreload: {
      polyfill: false,
    },
  },
  server: {
    port: 2222,
    open: true,
  },
  preview: {
    port: 2222,
    open: true,
  },
});
