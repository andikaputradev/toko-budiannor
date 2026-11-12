import { el } from '../../shared/dom';

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

export interface LineChartPoint {
  readonly label: string;
  readonly value: number;
}

export function createLineChart(
  data: readonly LineChartPoint[],
  width = 380,
  height = 140,
): HTMLElement {
  const pad = { top: 18, right: 24, bottom: 28, left: 24 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));

  const chart = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'bo-chart-line-svg',
    role: 'img',
    'aria-label': 'Grafik tren omset penjualan',
  });

  // Garis grid horizontal tipis
  for (let i = 0; i <= 3; i += 1) {
    const y = pad.top + (innerH / 3) * i;
    chart.append(
      svg('line', {
        x1: String(pad.left),
        x2: String(width - pad.right),
        y1: String(y),
        y2: String(y),
        class: 'bo-chart-line-grid',
      }),
    );
  }

  // Hitung koordinat titik
  const points = data.map((d, index) => {
    const step = data.length > 1 ? innerW / (data.length - 1) : innerW / 2;
    const x = pad.left + index * step;
    const y = pad.top + innerH - (d.value / max) * innerH;
    return { x, y, ...d };
  });

  // Polyline garis grafik
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const line = svg('polyline', {
    points: polylinePoints,
    class: 'bo-chart-line-path',
    fill: 'none',
  });
  chart.append(line);

  // Area di bawah garis
  if (points.length > 0) {
    const firstP = points[0];
    const lastP = points[points.length - 1];
    if (firstP && lastP) {
      const areaPoints = `${polylinePoints} ${lastP.x},${pad.top + innerH} ${firstP.x},${pad.top + innerH}`;
      const area = svg('polygon', {
        points: areaPoints,
        class: 'bo-chart-line-area',
      });
      chart.prepend(area);
    }
  }

  // Titik lingkaran dan teks label
  points.forEach((p) => {
    const circle = svg('circle', {
      cx: String(p.x),
      cy: String(p.y),
      r: '4',
      class: 'bo-chart-line-dot',
    });
    chart.append(circle);

    const text = svg('text', {
      x: String(p.x),
      y: String(height - 8),
      class: 'bo-chart-line-label',
      'text-anchor': 'middle',
    });
    text.textContent = p.label;
    chart.append(text);
  });

  return el('div', { className: 'bo-chart-line' }, chart);
}

export interface DonutSegment {
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

export function createDonutChart(
  segments: readonly DonutSegment[],
  size = 110,
  strokeWidth = 14,
): HTMLElement {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  const chart = svg('svg', {
    viewBox: `0 0 ${size} ${size}`,
    class: 'bo-donut-svg',
    width: String(size),
    height: String(size),
    role: 'img',
    'aria-label': 'Grafik komposisi omset kas dan piutang',
  });

  let accumulatedPercent = 0;

  segments.forEach((seg) => {
    const percent = seg.value / total;
    const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`;
    const strokeDashoffset = String(-circumference * accumulatedPercent);

    const circle = svg('circle', {
      cx: String(size / 2),
      cy: String(size / 2),
      r: String(radius),
      fill: 'none',
      stroke: seg.color,
      'stroke-width': String(strokeWidth),
      'stroke-dasharray': strokeDasharray,
      'stroke-dashoffset': strokeDashoffset,
      class: 'bo-donut-segment',
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
    });

    chart.append(circle);
    accumulatedPercent += percent;
  });

  return el('div', { className: 'bo-donut-wrapper' }, chart);
}

// Warna kategori grafik: tujuh nada `--chart-1` sampai `--chart-7` (bo-dashboard.css), tetap sama
// pada semua palet tema karena melambangkan kategori data, bukan aksen.
export type ChartTone = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ChartDatum {
  readonly label: string;
  readonly value: number;
  readonly tone: ChartTone;
}

// Batang tegak berwarna. Teks tidak ada di dalam SVG (legenda ada di luar), jadi SVG boleh
// meregang mengisi wadahnya.
export function createColorBars(items: readonly ChartDatum[], ariaLabel: string): SVGSVGElement {
  const width = 120;
  const height = 100;
  const gap = 8;
  const slot = (width - gap * (items.length + 1)) / Math.max(1, items.length);
  const max = Math.max(1, ...items.map((item) => item.value));
  const chart = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    class: 'bo-bars',
    role: 'img',
    'aria-label': ariaLabel,
  });
  items.forEach((item, index) => {
    const barHeight = item.value > 0 ? Math.max(2, (item.value / max) * (height - 4)) : 0;
    chart.append(
      svg('rect', {
        x: String(gap + index * (slot + gap)),
        y: String(height - 1 - barHeight),
        width: String(slot),
        height: String(barHeight),
        rx: '2',
        class: `bo-bars__bar bo-tone-${String(item.tone)}`,
      }),
    );
  });
  chart.append(
    svg('line', {
      x1: '0',
      x2: String(width),
      y1: String(height - 0.5),
      y2: String(height - 0.5),
      class: 'bo-bars__axis',
    }),
  );
  return chart;
}

// Donat dengan dua baris teks di tengah (mis. TOTAL dan jumlahnya).
export function createDonutTotal(
  items: readonly ChartDatum[],
  centerLines: readonly [string, string],
  ariaLabel: string,
): SVGSVGElement {
  const size = 120;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const chart = svg('svg', {
    viewBox: `0 0 ${size} ${size}`,
    class: 'bo-donut',
    role: 'img',
    'aria-label': ariaLabel,
  });
  let accumulated = 0;
  items.forEach((item) => {
    const share = item.value / total;
    chart.append(
      svg('circle', {
        cx: String(size / 2),
        cy: String(size / 2),
        r: String(radius),
        fill: 'none',
        'stroke-width': String(stroke),
        'stroke-dasharray': `${String(circumference * share)} ${String(circumference * (1 - share))}`,
        'stroke-dashoffset': String(-circumference * accumulated),
        transform: `rotate(-90 ${String(size / 2)} ${String(size / 2)})`,
        class: `bo-donut__segment bo-tone-${String(item.tone)}`,
      }),
    );
    accumulated += share;
  });
  const [heading, value] = centerLines;
  const top = svg('text', {
    x: String(size / 2),
    y: String(size / 2 - 3),
    'text-anchor': 'middle',
    class: 'bo-donut__heading',
  });
  top.textContent = heading;
  const bottom = svg('text', {
    x: String(size / 2),
    y: String(size / 2 + 10),
    'text-anchor': 'middle',
    class: 'bo-donut__value',
  });
  bottom.textContent = value;
  chart.append(top, bottom);
  return chart;
}

export interface HorizontalBarDatum extends ChartDatum {
  // Teks nilai di kanan baris (mis. "Rp 1.245.000.000").
  readonly text: string;
}

// Batang mendatar: titik warna dan nama, batang, lalu nilai. Lebar batang lewat CSSOM (variabel
// --bar), bukan atribut style, karena CSP menolaknya.
export function createHorizontalBars(
  items: readonly HorizontalBarDatum[],
  ariaLabel: string,
): HTMLElement {
  const max = Math.max(1, ...items.map((item) => item.value));
  return el(
    'div',
    { className: 'bo-hbars', attrs: { role: 'img', 'aria-label': ariaLabel } },
    ...items.map((item) => {
      const fill = el('span', { className: `bo-hbars__fill bo-tone-${String(item.tone)}` });
      fill.style.setProperty(
        '--bar',
        `${String(Math.max(2, Math.round((item.value / max) * 100)))}%`,
      );
      return el(
        'div',
        { className: 'bo-hbars__row' },
        el('span', { className: `bo-hbars__dot bo-tone-${String(item.tone)}` }),
        el('span', { className: 'bo-hbars__label', text: item.label }),
        el('span', { className: 'bo-hbars__track' }, fill),
        el('span', { className: 'bo-hbars__value', text: item.text }),
      );
    }),
  );
}
