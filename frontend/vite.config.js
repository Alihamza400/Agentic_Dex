import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // One .env for the whole project: the deploy scripts write addresses there and
  // the AI pages read VITE_API_BASE_URL from it.
  envDir: '..',
  server: {
    port: 5173,
  },
})
