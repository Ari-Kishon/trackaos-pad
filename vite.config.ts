import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Production is served from s3://…/trackaos-pad/; keep root paths in dev.
  base: command === 'build' ? '/trackaos-pad/' : '/',
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
}));
