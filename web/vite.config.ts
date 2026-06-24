import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so assets load correctly from any path prefix.
  // Works at both console.proappstore.online/ and proappstore.online/app/.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
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
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: { host: true },
});
