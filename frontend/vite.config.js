import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: '127.0.0.1',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        name: 'MTG Workshop',
        short_name: 'MTG Workshop',
        description: 'AI-powered Magic: The Gathering deck builder and analyzer',
        theme_color: '#0c0d11',
        background_color: '#0c0d11',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['**/pwa-*.png', '**/apple-touch-icon.png'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/cards\/image/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'card-image-api',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /\/api\/cards\/search/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'card-search-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\/api\/commanders\/search/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'commander-search-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\/api\/rules\/search/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'rules-search-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\/api\/deck\/(analyze|recommend|combos|composition|budget-swaps|export)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'deck-analysis-api',
              networkTimeoutSeconds: 30,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\/api\/deck\/(ai|wizard|planeswalker)\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\/rules\/ask/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/cards\.scryfall\.io\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scryfall-images',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
