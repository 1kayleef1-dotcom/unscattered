import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works from any static host or subpath.
// Routing uses HashRouter, so no basename wiring is needed.
// In dev, /api is proxied to the Claude proxy server (npm run server).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
})
