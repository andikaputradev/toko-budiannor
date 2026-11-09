import { el, nextId } from '../dom';

export interface AreaDatum {
  readonly label: string;
  readonly value: number;
  readonly caption: string;
}

export interface AreaChartOptions {
  readonly title: string;
  readonly data: readonly AreaDatum[];
  readonly axisLabel: (value: number) => string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly minTop?: number | undefined;
  /** Tampilkan label sumbu x tiap sekian titik agar tidak bertumpuk. */
  readonly labelEvery?: number | undefined;
  readonly selectedIndex?: number | undefined;
  readonly onSelect?: ((datum: AreaDatum, index: number) => void) | undefined;
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

// Grafik area dengan garis, titik yang dapat diketuk, dan tabel tersembunyi untuk pembaca layar.
export function createAreaChart(options: AreaChartOptions): HTMLElement {
  const width = options.width ?? 320;
  const height = options.height ?? 220;
  const pad = { top: 20, right: 16, bottom: 34, left: 46 };
  const max = Math.max(1, options.minTop ?? 1, ...options.data.map((item) => item.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const count = options.data.length;
  const every = options.labelEvery ?? 1;
  const xAt = (index: number): number =>
    pad.left + (count <= 1 ? innerWidth / 2 : (index / (count - 1)) * innerWidth);
  const yAt = (value: number): number => pad.top + innerHeight - (value / top) * innerHeight;
  const gradientId = nextId('mob-area');
  const chart = svg('svg', {
    viewBox: `0 0 ${String(width)} ${String(height)}`,
    class: 'mob-area__svg',
    role: options.onSelect === undefined ? 'img' : 'group',
    'aria-label': options.title,
  });
  const defs = svg('defs', {});
  const gradient = svg('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
  gradient.append(svg('stop', { offset: '0', class: 'mob-area__stop mob-area__stop--top' }));
  gradient.append(svg('stop', { offset: '1', class: 'mob-area__stop mob-area__stop--bottom' }));
  defs.append(gradient);
  chart.append(defs);

  for (let value = 0; value <= top; value += step) {
    const y = yAt(value);
    chart.append(
      svg('line', {
        x1: String(pad.left),
        x2: String(width - pad.right),
        y1: String(y),
        y2: String(y),
        class: 'mob-area__grid',
      }),
    );
    const tick = svg('text', {
      x: String(pad.left - 8),
      y: String(y + 4),
      class: 'mob-area__tick',
      'text-anchor': 'end',
    });
    tick.textContent = options.axisLabel(value);
    chart.append(tick);
  }

  if (count > 0) {
    const points = options.data.map(
      (item, index) => `${String(xAt(index))},${String(yAt(item.value))}`,
    );
    const baseline = yAt(0);
    chart.append(
      svg('polygon', {
        points: `${String(xAt(0))},${String(baseline)} ${points.join(' ')} ${String(xAt(count - 1))},${String(baseline)}`,
        fill: `url(#${gradientId})`,
        class: 'mob-area__fill',
      }),
      svg('polyline', { points: points.join(' '), class: 'mob-area__line', fill: 'none' }),
    );
  }

  options.data.forEach((item, index) => {
    const x = xAt(index);
    const selected = options.selectedIndex === index;
    const dot = svg('circle', {
      cx: String(x),
      cy: String(yAt(item.value)),
      r: selected ? '6' : '4',
      class: selected ? 'mob-area__dot is-selected' : 'mob-area__dot',
    });
    const title = svg('title', {});
    title.textContent = `${item.label}: ${item.caption}`;
    dot.append(title);
    chart.append(dot);
    if (index % every === 0 || index === count - 1) {
      const tick = svg('text', {
        x: String(x),
        y: String(height - pad.bottom + 20),
        class: 'mob-area__tick',
        'text-anchor': 'middle',
      });
      tick.textContent = item.label;
      chart.append(tick);
    }
    if (options.onSelect !== undefined) {
      const slot = count <= 1 ? innerWidth : innerWidth / (count - 1);
      const hit = svg('rect', {
        x: String(x - slot / 2),
        y: String(pad.top),
        width: String(slot),
        height: String(innerHeight),
        class: 'mob-area__hit',
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
  return el('figure', { className: 'mob-area' }, chart, table);
}
