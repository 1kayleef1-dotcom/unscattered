import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<owner>.github.io/unscattered/ on GitHub Pages, so
  // assets need to resolve under that subpath rather than the domain root.
  // Routing itself uses HashRouter, so no basename wiring is needed there.
  base: '/unscattered/',
  plugins: [react()],
})
