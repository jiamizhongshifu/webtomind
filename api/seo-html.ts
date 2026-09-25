import fs from 'node:fs';
import path from 'node:path';
export { replaceSeoTag } from './seo-render-utils.js';

export function readSeoIndexHtml(): string {
  const candidates = [
    path.join(process.cwd(), 'dist/index.html'),
    path.join(process.cwd(), 'server/public/index.html'),
    path.join(process.cwd(), 'public/index.html'),
    path.join(process.cwd(), 'index.html')
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  }

  throw new Error('Built index.html not found');
}
