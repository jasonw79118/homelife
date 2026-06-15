import { copyFileSync, existsSync } from 'node:fs';

if (existsSync('index.source.html')) {
  copyFileSync('index.source.html', 'index.html');
}
