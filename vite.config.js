import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Set VITE_BASE_PATH in your GitHub Actions workflow to /<repo-name>/
// Example: VITE_BASE_PATH=/microstructure-edge/
export default defineConfig({
  plugins: [react()],
  base: '/react-swing-trade/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
        }
      }
    }
  }
})
