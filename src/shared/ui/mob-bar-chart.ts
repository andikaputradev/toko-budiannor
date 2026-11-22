import { el } from '../dom';

export interface MobBarDatum {
  readonly label: string;
  readonly value: number;
  readonly caption: string;
}

export interface MobBarChartOptions {
  readonly title: string;
  readonly data: readonly MobBarDatum[];
  readonly axisLabel: (value: number) => string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly minTop?: number | undefined;
  readonly selectedIndex?: number | undefined;
  readonly onSelect?: ((datum: MobBarDatum, index: number) => void) | undefined;
}

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Readonly<Record<string, string>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function niceStep(max: number): number {
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

// Grafik batang untuk omzet bulanan: sumbu dimulai dari nol, batang dapat diketuk, dan ada tabel
// tersembunyi untuk pembaca layar.
export function createMobBarChart(options: MobBarChartOptions): HTMLElement {
  const width = options.width ?? 320;
  const height = options.height ?? 220;
  const pad = { top: 20, right: 12, bottom: 34, left: 46 };
  const max = Math.max(1, options.minTop ?? 1, ...options.data.map((item) => item.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const count = Math.max(1, options.data.length);
  const slot = innerWidth / count;
  const yAt = (value: number): number => pad.top + innerHeight - (value / top) * innerHeight;
  const chart = svg('svg', {
    viewBox: `0 0 ${String(width)} ${String(height)}`,
    class: 'mob-bars__svg',
    role: options.onSelect === undefined ? 'img' : 'group',
    'aria-label': options.title,
  });
  for (let value = 0; value <= top; value += step) {
    const y = yAt(value);
    chart.append(
      svg('line', {
        x1: String(pad.left),
        x2: String(width - pad.right),
        y1: String(y),
        y2: String(y),
        class: 'mob-bars__grid',
      }),
    );
    const tick = svg('text', {
      x: String(pad.left - 8),
      y: String(y + 4),
      class: 'mob-bars__tick',
      'text-anchor': 'end',
    });
    tick.textContent = options.axisLabel(value);
    chart.append(tick);
  }
  options.data.forEach((item, index) => {
    const barWidth = slot * 0.56;
    const x = pad.left + index * slot + (slot - barWidth) / 2;
    const barHeight = Math.max(0, (item.value / top) * innerHeight);
    const selected = options.selectedIndex === index;
    const bar = svg('rect', {
      x: String(x),
      y: String(yAt(item.value)),
      width: String(barWidth),
      height: String(barHeight),
      rx: '4',
      class: selected ? 'mob-bars__bar is-selected' : 'mob-bars__bar',
    });
    const title = svg('title', {});
    title.textContent = `${item.label}: ${item.caption}`;
    bar.append(title);
    chart.append(bar);
    const tick = svg('text', {
      x: String(x + barWidth / 2),
      y: String(height - pad.bottom + 20),
      class: 'mob-bars__tick',
      'text-anchor': 'middle',
    });
    tick.textContent = item.label;
    chart.append(tick);
    if (options.onSelect !== undefined) {
      const hit = svg('rect', {
        x: String(pad.left + index * slot),
        y: String(pad.top),
        width: String(slot),
        height: String(innerHeight),
        class: 'mob-bars__hit',
        tabindex: '0',
        role: 'button',
        'aria-label': `${item.label}: ${item.caption}`,
      });
      const choose = (): void => {
        options.onSelect?.(item, index);
      };
      hit.addEventListener('click', choose);
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choose();
        }
      });
      chart.append(hit);
    }
  });
  const table = el(
    'table',
    { className: 'visually-hidden' },
    el('caption', { text: options.title }),
    el(
      'tbody',
      {},
      ...options.data.map((item) =>
        el('tr', {}, el('th', { text: item.label }), el('td', { text: item.caption })),
      ),
    ),
  );
  return el('figure', { className: 'mob-bars' }, chart, table);
}
