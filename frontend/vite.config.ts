import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Used only by the dev server. In production nginx serves the bundle and
// proxies /api instead, so client code never needs a base URL.
//
// API_PROXY_TARGET has no VITE_ prefix on purpose: Vite inlines VITE_
// variables into the client bundle, and this one is only read here, in Node.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind 0.0.0.0 so the port is reachable from outside the container.
    host: true,
    port: 5173,
    // Fail instead of moving to 5174: docker-compose.yml publishes 5173 as is,
    // and a different port would break HMR.
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        // Keep `Host: localhost:5173`. The session cookie is scoped to the origin
        // the browser sees, and rewriting the Host header is how that quietly
        // breaks.
        changeOrigin: false,
      },
    },
  },
});
