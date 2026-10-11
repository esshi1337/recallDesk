import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({ plugins: [react(), ...(mode === 'browser' ? [{ name: 'browser-manifest', transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' as const }, { tag: 'meta', attrs: { name: 'theme-color', content: '#000000' }, injectTo: 'head' as const }] }] : [])], base: './', build: { outDir: mode === 'browser' ? 'dist-web' : 'dist' } }));
