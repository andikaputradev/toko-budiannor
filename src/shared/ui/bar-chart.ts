import { el } from '../dom';

export interface BarDatum {
  readonly label: string;
  readonly value: number;
  readonly caption: string;
}

export interface BarChartOptions {
  readonly title: string;
  readonly data: readonly BarDatum[];
  readonly axisLabel: (value: number) => string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly minTop?: number | undefined;
  readonly selectedIndex?: number | undefined;
  readonly onSelect?: ((datum: BarDatum, index: number) => void) | undefined;
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
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export function createBarChart(options: BarChartOptions): HTMLElement {
  const width = options.width ?? 520;
  const height = options.height ?? 360;
  const pad = { top: 16, right: 12, bottom: 36, left: width < 400 ? 48 : 64 };
  const max = Math.max(1, options.minTop ?? 1, ...options.data.map((item) => item.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const chart = svg('svg', {
    viewBox: `0 0 ${String(width)} ${String(height)}`,
    class: 'bo-chart__svg',
    role: options.onSelect === undefined ? 'img' : 'group',
    'aria-label': options.title,
  });
  for (let value = 0; value <= top; value += step) {
    const y = pad.top + innerHeight - (value / top) * innerHeight;
    chart.append(
      svg('line', {
        x1: String(pad.left),
        x2: String(width - pad.right),
        y1: String(y),
        y2: String(y),
        class: 'bo-chart__grid',
      }),
    );
    const tick = svg('text', {
      x: String(pad.left - 8),
      y: String(y + 4),
      class: 'bo-chart__tick',
      'text-anchor': 'end',
    });
    tick.textContent = options.axisLabel(value);
    chart.append(tick);
  }
  const slot = innerWidth / Math.max(1, options.data.length);
  options.data.forEach((item, index) => {
    const barHeight = (item.value / top) * innerHeight;
    const x = pad.left + index * slot + slot * 0.2;
    const selectable = options.onSelect !== undefined;
    const bar = svg('rect', {
      x: String(x),
      y: String(pad.top + innerHeight - barHeight),
      width: String(slot * 0.6),
      height: String(barHeight),
      class: options.selectedIndex === index ? 'bo-chart__bar is-selected' : 'bo-chart__bar',
    });
    const title = svg('title', {});
    title.textContent = `${item.label}: ${item.caption}`;
    bar.append(title);
    chart.append(bar);
    if (selectable) {
      const hit = svg('rect', {
        x: String(pad.left + index * slot),
        y: String(pad.top),
        width: String(slot),
        height: String(innerHeight),
        class: 'bo-chart__hit',
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
    const tick = svg('text', {
      x: String(x + (slot * 0.6) / 2),
      y: String(height - pad.bottom + 20),
      class: 'bo-chart__tick',
      'text-anchor': 'middle',
    });
    tick.textContent = item.label;
    chart.append(tick);
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
  return el('figure', { className: 'bo-chart' }, chart, table);
}
