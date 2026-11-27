import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Without this, the manifest/service worker only get generated on
      // `npm run build` — testing the install prompt would otherwise mean a
      // full production build every time. Fine to leave on; it doesn't affect
      // the production build's behavior.
      devOptions: { enabled: true },
      // Service worker only handles static build assets (JS/CSS/fonts/icons).
      // API calls, uploaded media, and the Socket.IO connection are deliberately
      // NOT cached here — this is a live, real-time social app; serving stale
      // hangout/message data from cache would be actively misleading, not a
      // convenience. This makes the app SHELL installable and fast to load,
      // not the data inside it usable offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/socket\.io/],
      },
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Juana',
        short_name: 'Juana',
        description: "Stop swiping into the void. Start showing up — join a hangout, chat with the group, and message who you actually click with.",
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        // Matches the app's actual dark theme (see src/pages/Landing.css :root)
        // rather than a generic default, so the OS splash screen and browser
        // chrome look like a continuation of the app, not a mismatched wrapper.
        background_color: '#12141c',
        theme_color: '#12141c',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
})
