import { el } from '../dom';
import { label } from '../messages';

export function createSkeleton(lines = 3): HTMLDivElement {
  const container = el('div', {
    className: 'skeleton',
    attrs: { role: 'status', 'aria-busy': 'true', 'aria-label': label('memuatData') },
  });
  for (let index = 0; index < lines; index += 1) {
    container.append(el('div', { className: 'skeleton__line', attrs: { 'aria-hidden': 'true' } }));
  }
  return container;
}
