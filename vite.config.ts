import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
// One id per build: compiled into the app and written to version.json, so a phone can tell it is behind.
const BUILD_ID = `${pkg.version}+${Date.now().toString(36)}`;

function versionJson(): Plugin {
  return {
    name: 'sf-version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, build: BUILD_ID }) });
    },
  };
}

// VITE_BASE: '/shield-fitness-user/' on GitHub Pages, '/' on Vercel (and local dev).
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  define: { __APP_BUILD__: JSON.stringify(BUILD_ID) },
  plugins: [
    preact(),
    versionJson(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false, // registered by src/pwa/update.ts
      manifestFilename: 'manifest.webmanifest',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,webmanifest,png,svg}'],
        globIgnores: ['machines/**', 'atlas/**', 'version.json'],
      },
      manifest: {
        id: base,
        name: 'Shields',
        short_name: 'Shields',
        description: 'Shields Fitness Club. Train smarter. Works offline.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        // Same values as --bg-base in src/ui/styles/tokens.css (a manifest cannot read CSS variables).
        theme_color: '#0d0c0a',
        background_color: '#0d0c0a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: { outDir: 'dist', target: 'es2022' },
});
