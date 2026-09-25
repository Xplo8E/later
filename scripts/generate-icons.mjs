import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const source = readFileSync('public/favicon.svg', 'utf8');
mkdirSync('public/icons', { recursive: true });
for (const size of [180, 192, 512]) {
  const renderer = new Resvg(source, { fitTo: { mode: 'width', value: size } });
  const png = renderer.render().asPng();
  writeFileSync(`public/icons/later-${size}.png`, png);
}

// Reuse the SVG contents inside an inset group for the maskable icon's safe area.
// Strip the opening <svg ...> at the start and closing </svg> plus trailing whitespace at the end.
// These patterns assume the controlled favicon source, not arbitrary SVG/XML input.
const contents = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0e1010"/><g transform="translate(96 96) scale(10)">${contents}</g></svg>`;
const maskablePng = new Resvg(maskable).render().asPng();
writeFileSync('public/icons/later-maskable-512.png', maskablePng);
