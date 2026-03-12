import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages: Setze hier deinen Repository-Namen
  // Beispiel: wenn dein Repo "f1-fantasy" heißt → base: '/f1-fantasy/'
  base: '/f1-fantasy/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
