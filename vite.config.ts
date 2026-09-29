import { defineConfig, type Plugin, type PreviewServer } from 'vite';

/** S3 / production prefix. Dev stays at `/`; preview must rewrite this onto `build/`. */
const SITE_BASE = '/trackaos-pad';

function previewSiteBase(): Plugin {
  return {
    name: 'preview-site-base',
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url;
        if (url === SITE_BASE || url?.startsWith(`${SITE_BASE}/`)) {
          req.url = url.slice(SITE_BASE.length) || '/';
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // Production is served from s3://…/trackaos-pad/; keep root paths in dev.
  base: command === 'build' ? `${SITE_BASE}/` : '/',
  plugins: [previewSiteBase()],
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
    port: 4040,
    open: true,
  },
  preview: {
    port: 4040,
    open: `${SITE_BASE}/`,
  },
}));
