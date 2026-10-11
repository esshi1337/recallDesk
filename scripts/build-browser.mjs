import { readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve('dist-web');
await copyFile('assets/icon.svg', path.join(root, 'icon.svg'));
await copyFile('assets/icon-192.png', path.join(root, 'icon-192.png'));
await copyFile('assets/icon-512.png', path.join(root, 'icon-512.png'));
await writeFile(path.join(root, 'manifest.webmanifest'), JSON.stringify({ id: './', name: 'Recall Desk', short_name: 'Recall Desk', description: 'Local study exams, materials, and progress timeline', start_url: './', scope: './', display: 'standalone', background_color: '#000000', theme_color: '#000000', icons: [{ src: './icon-192.png', sizes: '192x192', type: 'image/png' }, { src: './icon-512.png', sizes: '512x512', type: 'image/png' }, { src: './icon.svg', sizes: 'any', type: 'image/svg+xml' }] }, null, 2));
async function files(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) { const relative = `${prefix}${entry.name}`; if (entry.isDirectory()) result.push(...await files(path.join(dir, entry.name), `${relative}/`)); else if (entry.name !== 'sw.js') result.push(relative); }
  return result.sort();
}
const assets = await files(root);
const hash = createHash('sha256'); for (const file of assets) { hash.update(file); hash.update(await readFile(path.join(root, file))); }
const version = hash.digest('hex').slice(0, 16);
await writeFile(path.join(root, 'sw.js'), `const PREFIX = 'recall-desk-shell:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + '${version}';
const ASSETS = ${JSON.stringify(assets)}.map(p => new URL(p, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      return (await cache.match(new URL('index.html', self.registration.scope).href)) || fetch(event.request);
    }
    return (await cache.match(event.request)) || fetch(event.request);
  })());
});
`);
console.log(`Browser build ready: ${root} (${assets.length} offline assets, ${version})`);
