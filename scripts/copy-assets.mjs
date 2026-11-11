import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { flatten, loadTokenDocument, resolveToken } from './lib/tokens.mjs';

const ROOT = new URL('../', import.meta.url);
const FONT_SOURCE = new URL('node_modules/@fontsource/ibm-plex-sans/', ROOT);
const ICON_SOURCE = new URL('node_modules/lucide-static/', ROOT);
const FONT_TARGET = new URL('public/fonts/', ROOT);
const ICON_TARGET = new URL('public/icons/', ROOT);
const FONT_WEIGHTS = [400, 500, 600, 700];
const ICONS = [
  'search',
  'printer',
  'wifi-off',
  'wifi',
  'trash-2',
  'triangle-alert',
  'circle-check',
  'download',
  'x',
  'arrow-left-right',
  'banknote',
  'pause',
  'save',
  'eye',
  'eye-off',
  'info',
  'circle-x',
  'clock',
  'pencil',
  'inbox',
  'chevron-down',
  'chevron-up',
  'bell',
  'refresh-cw',
  'phone',
  'message-circle',
  'send',
  'trending-up',
  'trending-down',
  'layout-dashboard',
  'package',
  'clipboard-list',
  'file-text',
  'wallet',
  'plus',
  'check',
  'chevron-left',
  'menu',
  'ellipsis-vertical',
  'scan-barcode',
  'user-round',
  'receipt',
  'log-out',
  'minus',
  'delete',
  'shopping-cart',
  'funnel',
  'users',
  'settings',
  'qr-code',
  'mail',
  'calendar',
  'image-plus',
  'paperclip',
  'lock',
  'smartphone',
  'database',
  'layout-grid',
  'list',
  'sun',
  'moon',
  'monitor',
  'arrow-left',
  'chevron-right',
  'credit-card',
  'hand-coins',
  'truck',
  'chart-column',
  'chart-pie',
  'chart-line',
  'scale',
  'receipt-text',
  'zoom-in',
  'zoom-out',
  'palette',
  'store',
  'warehouse',
  'tag',
  'share-2',
  'package-plus',
  'coins',
  'circle-alert',
  'history',
  'boxes',
  'shopping-bag',
  'file-down',
  'badge-percent',
  'cloud-check',
  'cloud-off',
  'building-2',
  'landmark',
  'circle-dollar-sign',
  'user-check',
  'maximize-2',
  'chart-area',
];
const ALLOWED_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);

async function copyFonts() {
  await mkdir(FONT_TARGET, { recursive: true });
  for (const weight of FONT_WEIGHTS) {
    const name = `ibm-plex-sans-latin-${weight}-normal.woff2`;
    await copyFile(new URL(`files/${name}`, FONT_SOURCE), new URL(name, FONT_TARGET));
  }
  await copyFile(
    new URL('LICENSE', FONT_SOURCE),
    new URL('LICENSE-IBM-Plex-Sans-OFL-1.1.txt', FONT_TARGET),
  );
}

function extractShapes(name, svg) {
  const match = /<svg\b[^>]*>([\s\S]*?)<\/svg>/.exec(svg);
  if (match === null) {
    throw new Error(`Berkas ikon ${name} tidak memuat elemen svg`);
  }
  const shapes = match[1].replace(/\s+/g, ' ').trim();
  for (const tag of shapes.matchAll(/<\/?([A-Za-z][\w:-]*)/g)) {
    if (!ALLOWED_TAGS.has(tag[1])) {
      throw new Error(`Ikon ${name} memuat elemen yang tidak diizinkan: ${tag[1]}`);
    }
  }
  if (/\son[a-z]+\s*=|javascript:|href\s*=/i.test(shapes)) {
    throw new Error(`Ikon ${name} memuat atribut yang tidak diizinkan`);
  }
  return shapes;
}

async function buildSprite() {
  const document = await loadTokenDocument(new URL('tokens/tokens.json', ROOT));
  const tokens = flatten(document);
  const strokeWidth = resolveToken(tokens, 'semantic.icon.stroke-width', {
    theme: 'light',
    profile: undefined,
  });
  const symbols = [];
  for (const name of ICONS) {
    const svg = await readFile(new URL(`icons/${name}.svg`, ICON_SOURCE), 'utf8');
    const attributes = `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
    symbols.push(
      `<symbol id="${name}" viewBox="0 0 24 24" ${attributes}>${extractShapes(name, svg)}</symbol>`,
    );
  }
  await mkdir(ICON_TARGET, { recursive: true });
  await writeFile(
    new URL('sprite.svg', ICON_TARGET),
    `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`,
    'utf8',
  );
  await copyFile(new URL('LICENSE', ICON_SOURCE), new URL('LICENSE-Lucide-ISC.txt', ICON_TARGET));
}

await copyFonts();
await buildSprite();
console.log(`assets: ${FONT_WEIGHTS.length} berkas font dan lisensinya disalin ke public/fonts`);
console.log(`assets: sprite ${ICONS.length} ikon dan lisensinya ditulis ke public/icons`);
