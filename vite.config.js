import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config for GitHub Pages under repo: Trojan-HIV-2
export default defineConfig({
  plugins: [react()],
  base: '/Trojan-HIV-2/', // ← must match repo name exactly
})

