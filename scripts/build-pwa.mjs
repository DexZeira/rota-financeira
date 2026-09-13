import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { workerSource } from './pwa-worker.mjs';

// Only public build artifacts enter the offline cache. Never cache API requests.
const files = (await readdir('dist', { recursive: true })).filter((file) =>
  /^(?:assets\/.*\.(?:js|css|woff2?)|index\.html|favicon\.svg|manifest\.webmanifest)$/.test(file.replaceAll('\\', '/')),
);
const digest = createHash('sha256');
for (const file of files.sort()) digest.update(await readFile(join('dist', file)));
const name = `rota-shell-${digest.digest('hex').slice(0, 16)}`;
const urls = files.map((file) => '/' + file.replaceAll('\\', '/'));
await writeFile('dist/sw.js', workerSource(name, urls));
console.log(`PWA: ${files.length} arquivos públicos preparados para uso offline.`);
