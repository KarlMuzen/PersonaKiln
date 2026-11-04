import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig(() => {
  return {
    define: {
      // Surfaced in the UI (Settings footer, ErrorBoundary) so testers can report
      // which build they're on. __BUILD_TIME__ is set at `vite build` time, not per-request.
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'script',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/manifest\.webmanifest$/, /^\/_headers$/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        manifest: {
          name: 'PersonaKiln',
          short_name: 'PersonaKiln',
          description: 'The AI roleplay workbench',
          theme_color: '#191816',
          background_color: '#22211E',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          id: '/',
          categories: ['productivity', 'utilities', 'entertainment'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-maskable-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('gpt-tokenizer')) {
                return 'vendor-tokenizer';
              }
              if (id.includes('@google/genai')) {
                return 'vendor-genai';
              }
              if (id.includes('jszip')) {
                return 'vendor-jszip';
              }
              if (id.includes('dexie')) {
                return 'vendor-dexie';
              }
              if (id.includes('@dnd-kit')) {
                return 'vendor-dndkit';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('zod')) {
                return 'vendor-zod';
              }
              if (id.includes('react') || id.includes('react-dom') || id.includes('zustand')) {
                return 'vendor-core';
              }
              return 'vendor-libs';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
