import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Mock / real telemetry WebSocket server (uvicorn on :8000).
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
