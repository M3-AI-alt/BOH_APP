import { copyFileSync, existsSync } from 'node:fs';

const output = new URL('../dist/standalone/', import.meta.url);
if (!existsSync(new URL('server.js', output))) {
  throw new Error('Build the Node standalone target before packaging Hostinger.');
}
for (const file of ['hostinger-server.mjs', 'hostinger-config.mjs']) {
  copyFileSync(new URL(file, import.meta.url), new URL(file, output));
}
console.log('Hostinger entry: dist/standalone/hostinger-server.mjs');
