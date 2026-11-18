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

// Skala sumbu: puncak kelipatan tiga langkah "bulat" (1, 2, 2,5, 5 kali pangkat sepuluh) supaya
// angka di samping grafik rapi, mis. 0, 25 Jt, 50 Jt, 75 Jt.
export function niceStep(maxValue: number): number {
  const raw = Math.max(1, maxValue) / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= raw) ?? 10;
  return unit * power;
}

export function axisLabel(value: number): string {
  if (value === 0) {
    return '0';
  }
  const trim = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');
  if (value >= 1_000_000_000) {
    return `${trim(value / 1_000_000_000)} M`;
  }
  if (value >= 1_000_000) {
    return `${trim(value / 1_000_000)} Jt`;
  }
  return value >= 1_000 ? `${trim(value / 1_000)} Rb` : trim(value);
}

// Grafik garis omset: angka skala di sisi kiri dan, saat penunjuk mengarah ke sebuah titik, kotak
// kecil berisi nilainya. Kotak memakai posisi persen lewat CSSOM karena CSP menolak atribut style.
export function createLineChart(
  data: readonly LineChartPoint[],
  width = 380,
  height = 140,
  formatValue: (value: number) => string = String,
): HTMLElement {
  const pad = { top: 10, right: 14, bottom: 20, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max);
  const top = step * 3;

  const chart = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'bo-chart-line-svg',
    role: 'img',
    'aria-label': `Grafik tren omset penjualan: ${data
      .map((d) => `${d.label} ${formatValue(d.value)}`)
      .join(', ')}`,
  });

  // Garis grid mendatar dan angka skalanya
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
    const tick = svg('text', {
      x: String(pad.left - 6),
      y: String(y + 3),
      class: 'bo-chart-line-axis',
      'text-anchor': 'end',
    });
    tick.textContent = axisLabel(top - step * i);
    chart.append(tick);
  }

  // Hitung koordinat titik
  const points = data.map((d, index) => {
    const slot = data.length > 1 ? innerW / (data.length - 1) : innerW / 2;
    const x = pad.left + index * slot;
    const y = pad.top + innerH - (d.value / top) * innerH;
    return { x, y, ...d };
  });

  // Polyline garis grafik
  const polylinePoints = points.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');
  const line = svg('polyline', {
    points: polylinePoints,
    class: 'bo-chart-line-path',
    fill: 'none',
  });
  chart.append(line);

  // Area di bawah garis
  const firstP = points[0];
  const lastP = points[points.length - 1];
  if (firstP && lastP) {
    const base = String(pad.top + innerH);
    const area = svg('polygon', {
      points: `${polylinePoints} ${String(lastP.x)},${base} ${String(firstP.x)},${base}`,
      class: 'bo-chart-line-area',
    });
    chart.prepend(area);
  }

  const tip = el('div', {
    className: 'bo-chart-tip',
    attrs: { hidden: '', 'aria-hidden': 'true' },
  });
  const showTip = (point: { x: number; y: number; value: number }): void => {
    tip.textContent = formatValue(point.value);
    tip.style.left = `${String((point.x / width) * 100)}%`;
    tip.style.top = `${String((point.y / height) * 100)}%`;
    tip.hidden = false;
  };

  // Titik lingkaran, teks label, dan sasaran sentuh yang lebih besar untuk penunjuk
  points.forEach((p) => {
    const circle = svg('circle', {
      cx: String(p.x),
      cy: String(p.y),
      r: '4',
      class: 'bo-chart-line-dot',
    });
    const hit = svg('circle', {
      cx: String(p.x),
      cy: String(p.y),
      r: '11',
      class: 'bo-chart-line-hit',
    });
    const hint = svg('title', {});
    hint.textContent = `${p.label}: ${formatValue(p.value)}`;
    hit.append(hint);
    hit.addEventListener('pointerenter', () => {
      showTip(p);
    });
    hit.addEventListener('pointerleave', () => {
      tip.hidden = true;
    });
    chart.append(circle, hit);

    const text = svg('text', {
      x: String(p.x),
      y: String(height - 6),
      class: 'bo-chart-line-label',
      'text-anchor': 'middle',
    });
    text.textContent = p.label;
    chart.append(text);
  });

  return el('div', { className: 'bo-chart-line' }, chart, tip);
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
