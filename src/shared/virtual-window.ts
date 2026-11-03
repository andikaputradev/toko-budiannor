export interface WindowInput {
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly rowHeight: number;
  readonly total: number;
  readonly overscan: number;
}

export interface WindowResult {
  readonly start: number;
  readonly end: number;
  readonly offset: number;
  readonly totalHeight: number;
}

export function computeWindow(input: WindowInput): WindowResult {
  const { viewportHeight, rowHeight, total, overscan } = input;
  const totalHeight = total * rowHeight;
  const maxTop = Math.max(0, totalHeight - viewportHeight);
  const top = Math.min(Math.max(input.scrollTop, 0), maxTop);
  const first = Math.floor(top / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + visible + overscan);
  return { start, end, offset: start * rowHeight, totalHeight };
}
