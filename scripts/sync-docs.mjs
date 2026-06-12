import { existsSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const distDir = 'dist';
const docsDir = 'docs';

if (!existsSync(distDir)) {
  console.error('dist folder is missing. Run npm run build first.');
  process.exit(1);
}

rmSync(docsDir, { recursive: true, force: true });
mkdirSync(docsDir, { recursive: true });

function copyRecursive(source, target) {
  const stat = statSync(source);
  if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      copyRecursive(join(source, entry), join(target, entry));
    }
    return;
  }
  copyFileSync(source, target);
}

copyRecursive(distDir, docsDir);
copyFileSync(join(docsDir, 'index.html'), join(docsDir, '404.html'));
writeFileSync(join(docsDir, '.nojekyll'), '');
console.log('Copied production build to docs for GitHub Pages.');
