import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const source = readFileSync('public/favicon.svg', 'utf8');
mkdirSync('public/icons', { recursive: true });
for (const size of [180, 192, 512]) writeFileSync(`public/icons/later-${size}.png`, new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng());
const contents = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0e1010"/><g transform="translate(96 96) scale(10)">${contents}</g></svg>`;
writeFileSync('public/icons/later-maskable-512.png', new Resvg(maskable).render().asPng());
