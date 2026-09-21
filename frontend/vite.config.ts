import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev-server configuration only — none of this ships. In production nginx.conf
// does the same two jobs (serve the bundle, proxy /api), which is exactly why
// client code never contains a base URL: where the API lives is always somebody
// else's problem. See "Base path" in docs/api_design.md.
//
// API_PROXY_TARGET is deliberately NOT VITE_-prefixed. A VITE_ variable is
// inlined into the client bundle by design, and an API host reachable from
// client code is the one thing api_design.md forbids. This is read here, in
// Node, at config time, and can never reach a browser.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind 0.0.0.0 so the port is reachable from outside the container.
    host: true,
    port: 5173,
    // Fail loudly rather than silently drifting to 5174 — the port is published
    // 1:1 in docker-compose.yml, and a silent bump would break HMR.
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
