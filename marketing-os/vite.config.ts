import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works from any static host or subpath.
// Routing uses HashRouter, so no basename wiring is needed.
export default defineConfig({
  base: './',
  plugins: [react()],
})
