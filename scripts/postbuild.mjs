import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function cleanDir(path) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

if (!existsSync('dist/index.html')) {
  throw new Error('dist/index.html was not created by Vite.');
}

copyFileSync('dist/index.html', 'dist/404.html');
writeFileSync('dist/.nojekyll', '');

// Branch fallback: GitHub Pages can serve from /docs.
cleanDir('docs');
cpSync('dist', 'docs', { recursive: true });

// Root fallback: if GitHub Pages is still set to main / root, it should still load.
if (existsSync('assets')) rmSync('assets', { recursive: true, force: true });
cpSync(join('dist', 'assets'), 'assets', { recursive: true });
copyFileSync(join('dist', 'index.html'), 'index.html');
copyFileSync(join('dist', '404.html'), '404.html');
writeFileSync('.nojekyll', '');
