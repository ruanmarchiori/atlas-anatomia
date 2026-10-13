import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dois builds a partir do mesmo código:
//  - web (padrão, GitHub Pages): PWA com service worker; modelos completo + reduzido.
//  - android (vite build --mode android): vai dentro do APK. Sem service worker (o app já
//    tem tudo localmente) e sem a versão completa dos modelos (o celular usa a reduzida).
export default defineConfig(({ mode }) => {
  const android = mode === 'android';

  // No build do Android, apaga dist/modelos/completo depois de copiar o public/.
  const semModelosCompletos: Plugin = {
    name: 'atlas-sem-modelos-completos',
    apply: 'build',
    closeBundle() {
      const dir = path.resolve(import.meta.dirname, 'dist/modelos/completo');
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };

  return {
    // Base relativa: funciona no GitHub Pages (subpasta /repo/) e dentro do app Android.
    base: './',
    plugins: [
      react(),
      android ? semModelosCompletos : VitePWA({
        // Registro manual em src/main.tsx (não registra dentro do app Android).
        injectRegister: false,
        registerType: 'autoUpdate',
        includeAssets: ['icones/*'],
        manifest: {
          id: './',
          name: 'Atlas Anatomia',
          short_name: 'Atlas Anatomia',
          description: 'Atlas de anatomia 3D para estudo pessoal, funciona offline.',
          lang: 'pt-BR',
          start_url: './',
          scope: './',
          display: 'fullscreen',
          display_override: ['fullscreen', 'standalone'],
          orientation: 'any',
          background_color: '#f4f1ea',
          theme_color: '#f4f1ea',
          icons: [
            { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icones/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Site (HTML, JS, CSS, catálogo, ícones) fica guardado na instalação do SW.
          globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
          globIgnores: ['modelos/**'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          // Modelos 3D: guardados no 1º uso (ou todos de uma vez pelo botão "Baixar para
          // usar offline", que grava no MESMO cache).
          runtimeCaching: [{
            urlPattern: ({ url }) => url.pathname.includes('/modelos/'),
            handler: 'CacheFirst',
            options: { cacheName: 'atlas-modelos-v1', cacheableResponse: { statuses: [0, 200] } },
          }],
        },
      }),
    ],
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1500,
    },
  };
});
