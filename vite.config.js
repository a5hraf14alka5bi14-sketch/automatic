import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Expose the package.json version to index.html via %VITE_APP_VERSION% (Vite's
// HTML env replacement). package.json stays the single source of truth, so the
// loading splash never drifts out of sync with the released version.
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
process.env.VITE_APP_VERSION = pkgVersion

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['server/**/*.js', 'src/**/*.{js,jsx}'],
      exclude: [
        'server/migrations/**',
        'node_modules',
        'dist',
        '.local',
        'tests',
        'src/main.jsx',          // React entry point — no logic
        'src/assets/**',
        'electron/**',
        'scripts/**',
      ],
      // No thresholds enforced: text reporter prints per-file baseline each run.
      // Raise to enforced thresholds once the baseline is comfortably high.
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router')) return 'router'
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor'
          }
        }
      }
    }
  }
})
