import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API_TARGET points at the Django API. In Docker it is the backend
// reachable through the host gateway; on a bare machine it is localhost.
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8080'
const storageTarget = process.env.VITE_STORAGE_TARGET || 'http://localhost:9000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Docker Desktop bind mounts don't emit inotify events to the container,
    // so without polling the dev server keeps serving the version of a file
    // it saw at startup — edits on the host never appear in the browser.
    watch: {
      usePolling: true,
      interval: 500,
    },
    proxy: {
      // Proxies Nominatim OpenStreetMap geocoding with server-side User-Agent to avoid CORS issues
      '/nominatim-proxy': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nominatim-proxy/, ''),
        headers: {
          'User-Agent': 'UrbanMend-Civic-App/1.0 (contact: support@urbanmend.org)',
        },
      },
      // Same-origin proxy: the browser only ever talks to localhost:5173,
      // so session cookies and CSRF behave exactly like a same-site deploy.
      // changeOrigin stays false so Django receives Host: localhost (allowed).
      '/api': {
        target: apiTarget,
        changeOrigin: false,
        secure: false,
      },
      '/media': {
        target: apiTarget,
        changeOrigin: false,
        secure: false,
      },
      // Proxies MinIO S3 media requests preserving Host: storage:9000 for SigV4 compliance
      '/urbenmend-media': {
        target: storageTarget,
        changeOrigin: false,
        secure: false,
        headers: {
          Host: 'storage:9000',
        },
      },
    },
  },
})
