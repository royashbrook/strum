import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let buildId = 'development';

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'strum-build-identity',
      configResolved(config) {
        buildId = JSON.parse(config.define!.__BUILD_ID__);
      },
      transformIndexHtml(html) {
        return html.replaceAll('%STRUM_BUILD%', buildId);
      },
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          // The edge consumes this as configuration, not a cacheable URL.
          if (request.url?.split('?')[0] === '/_headers') {
            response.statusCode = 404;
            response.end();
          } else next();
        });
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify('development') },
  server: { host: '127.0.0.1', port: 4193, strictPort: true },
  preview: { host: '127.0.0.1', port: 4194, strictPort: true },
  build: {
    target: 'es2022',
    license: { fileName: 'licenses.md' },
    rolldownOptions: {
      output: { postBanner: '/* Bundled dependency licenses: /licenses.md */' },
    },
  },
});
