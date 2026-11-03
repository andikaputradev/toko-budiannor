import { el } from '../../shared/dom';

export interface BarDatum {
  readonly label: string;
  readonly value: number;
  readonly caption: string;
}

export interface BarChartOptions {
  readonly title: string;
  readonly data: readonly BarDatum[];
  readonly axisLabel: (value: number) => string;
}

const SVG = 'http://www.w3.org/2000/svg';
const WIDTH = 520;
const HEIGHT = 360;
const PAD = { top: 16, right: 12, bottom: 36, left: 64 };

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

export function createBarChart(options: BarChartOptions): HTMLElement {
  const max = Math.max(1, ...options.data.map((item) => item.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const chart = svg('svg', {
    viewBox: `0 0 ${String(WIDTH)} ${String(HEIGHT)}`,
    class: 'bo-chart__svg',
    role: 'img',
    'aria-label': options.title,
  });
  for (let value = 0; value <= top; value += step) {
    const y = PAD.top + innerHeight - (value / top) * innerHeight;
    chart.append(
      svg('line', {
        x1: String(PAD.left),
        x2: String(WIDTH - PAD.right),
        y1: String(y),
        y2: String(y),
        class: 'bo-chart__grid',
      }),
    );
    const tick = svg('text', {
      x: String(PAD.left - 8),
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
    const x = PAD.left + index * slot + slot * 0.2;
    const bar = svg('rect', {
      x: String(x),
      y: String(PAD.top + innerHeight - barHeight),
      width: String(slot * 0.6),
      height: String(barHeight),
      class: 'bo-chart__bar',
    });
    const title = svg('title', {});
    title.textContent = `${item.label}: ${item.caption}`;
    bar.append(title);
    chart.append(bar);
    const tick = svg('text', {
      x: String(x + (slot * 0.6) / 2),
      y: String(HEIGHT - PAD.bottom + 20),
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

function niceStep(max: number): number {
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export * from '../../shared/ui/bar-chart';
