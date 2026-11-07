const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export type IllustrationKind = 'kasir' | 'keranjang';

type Attributes = Readonly<Record<string, string>>;

function shape<K extends keyof SVGElementTagNameMap>(
  tag: K,
  className: string,
  attributes: Attributes,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  node.setAttribute('class', className);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  return node;
}

function terminal(): SVGElement[] {
  return [
    shape('path', 'ill-soft', { d: 'M68 84 L58 106 H102 L92 84 Z' }),
    shape('rect', 'ill-soft ill-line', { x: '26', y: '16', width: '108', height: '70', rx: '9' }),
    shape('rect', 'ill-accent', { x: '42', y: '32', width: '50', height: '7', rx: '3.5' }),
    shape('rect', 'ill-accent', { x: '42', y: '47', width: '76', height: '7', rx: '3.5' }),
    shape('rect', 'ill-accent', { x: '42', y: '62', width: '38', height: '7', rx: '3.5' }),
    shape('circle', 'ill-accent', { cx: '134', cy: '98', r: '14' }),
    shape('circle', 'ill-soft', { cx: '134', cy: '98', r: '7' }),
  ];
}

function basket(): SVGElement[] {
  return [
    shape('path', 'ill-soft ill-line', { d: 'M28 36 H44 L56 82 H112 L124 50 H48' }),
    shape('rect', 'ill-accent', { x: '62', y: '58', width: '14', height: '16', rx: '3' }),
    shape('rect', 'ill-accent', { x: '82', y: '52', width: '14', height: '22', rx: '3' }),
    shape('circle', 'ill-accent', { cx: '68', cy: '98', r: '7' }),
    shape('circle', 'ill-accent', { cx: '104', cy: '98', r: '7' }),
  ];
}

export function createIllustration(kind: IllustrationKind): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', `illustration illustration--${kind}`);
  svg.setAttribute('viewBox', '0 0 160 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.append(...(kind === 'kasir' ? terminal() : basket()));
  return svg;
}
