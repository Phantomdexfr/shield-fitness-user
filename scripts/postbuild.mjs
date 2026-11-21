// Copies dist/index.html to dist/404.html so GitHub Pages serves the SPA for slug routes.
// Usage: node scripts/postbuild.mjs [distDir]   (default: dist)
import { copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const src = join(dist, 'index.html');

if (!existsSync(src)) {
  console.error(`postbuild: ${src} not found. Run the build first.`);
  process.exit(1);
}
copyFileSync(src, join(dist, '404.html'));
console.log('postbuild: dist/404.html written from dist/index.html');
