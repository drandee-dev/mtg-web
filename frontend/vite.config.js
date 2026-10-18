import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Visual pass I7. Every rule with a :hover selector is moved into a media block, so a
// tap on a phone no longer leaves its control "hovered". The query is the one
// useCanHover (src/lib/hooks.js) asks, so CSS and JS agree on what can hover. A list
// that mixes :hover with :focus-visible keeps its focus half outside the block.
const HOVER_ONLY = '(hover: hover) and (pointer: fine)'
const hoverOnly = {
  postcssPlugin: 'hover-only',
  Rule(rule, { AtRule }) {
    const parent = rule.parent
    if (parent?.type === 'atrule' && (parent.params === HOVER_ONLY || /keyframes$/.test(parent.name))) return
    const hover = rule.selectors.filter((s) => s.includes(':hover'))
    if (!hover.length) return
    // Moving ".x:not(:hover)" behind a hover query would turn it off on touch, the
    // opposite of what it says. Fail the build rather than guess.
    if (hover.some((s) => /:(not|is|where|has)\([^)]*:hover/.test(s))) throw rule.error(':hover inside :not(), :is(), :where() or :has() is not handled by hover-only')
    const media = new AtRule({ name: 'media', params: HOVER_ONLY })
    media.append(rule.clone({ selectors: hover }))
    rule.after(media)
    if (hover.length === rule.selectors.length) rule.remove()
    else rule.selectors = rule.selectors.filter((s) => !s.includes(':hover'))
  },
}

export default defineConfig({
  server: {
    host: '127.0.0.1',
  },
  css: { postcss: { plugins: [hoverOnly] } },
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
            purpose: 'any',
          },
          {
            // Dedicated maskable art: gem scaled into the 40%-radius safe zone so
            // launcher masks (circle/squircle) never clip the spark tips.
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['**/pwa-*.png', '**/maskable-*.png', '**/apple-touch-icon.png'],
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
