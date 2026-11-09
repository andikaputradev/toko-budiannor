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
