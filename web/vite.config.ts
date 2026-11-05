import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  // Relative base so assets load correctly from any path prefix.
  // Works at both console.proappstore.online/ and proappstore.online/app/.
  base: './',
  plugins: [
    ...(mode === 'candidate' ? [{
      name: 'isolated-candidate',
      transformIndexHtml(html: string) {
        return html.replace(/<link[^>]+https:\/\/fonts\.[^>]+>/g, '')
          .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'">`)
      },
    }] : []),
    react(),
    tailwindcss(),
    VitePWA({
      disable: mode === 'candidate',
      registerType: 'autoUpdate',
      // Inline the tiny registration snippet: a separate registerSW.js sits outside assets/, where the
      // bundle-size check (and any asset-path audit) cannot account for it.
      injectRegister: 'inline',
      workbox: {
        // `/.pas/*` carries auth callbacks and platform mediation: the service worker must never answer it
        // with the app shell.
        navigateFallbackDenylist: [/^\/\.pas\//],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,wasm,json}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Adds the Web Push 'push' + 'notificationclick' handlers (public/push-sw.js)
        // to the generated SW so agent task updates can notify the creator.
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i, handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i, handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
      // Single source of truth for the PWA manifest (VitePWA injects the link).
      manifest: {
        name: "ProAppStore Console",
        short_name: "Console",
        description: "Manage and build your apps on ProAppStore.",
        start_url: '/app/',
        scope: '/app/',
        display: 'standalone',
        background_color: "#ffffff",
        theme_color: "#7c3aed",
        orientation: "any",
        // The console has a bottom tab bar for phones; 360px is the narrowest layout it is designed for.
        // Not in the plugin ManifestOptions type, but the compliance check reads it from here.
        // @ts-expect-error min_viewport_width is not in ManifestOptions
        min_viewport_width: 360,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: { host: true },
}));
