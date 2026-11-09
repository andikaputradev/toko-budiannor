import { el } from '../dom';
import type { MobTone } from './mobile-card';

export interface RankItem {
  readonly name: string;
  readonly caption: string;
  readonly percent: number;
  readonly tone?: MobTone | undefined;
  readonly onSelect?: (() => void) | undefined;
}

// Daftar berperingkat dengan bar horizontal. Lebar bar lewat custom property (aman untuk CSP).
export function createRankList(items: readonly RankItem[]): HTMLElement {
  return el(
    'ol',
    { className: 'mob-rank' },
    ...items.map((item, index) => {
      const bar = el('span', { className: `mob-rank__bar mob-rank__bar--${item.tone ?? 'info'}` });
      const percent = Math.max(2, Math.min(100, Math.round(item.percent)));
      bar.style.setProperty('--bar', `${String(percent)}%`);
      const body = [
        el('span', { className: 'mob-rank__no', text: String(index + 1) }),
        el(
          'span',
          { className: 'mob-rank__main' },
          el(
            'span',
            { className: 'mob-rank__row' },
            el('span', { className: 'mob-rank__name', text: item.name }),
            el('span', { className: 'mob-rank__value', text: item.caption }),
          ),
          el('span', { className: 'mob-rank__track' }, bar),
        ),
      ];
      const onSelect = item.onSelect;
      if (onSelect === undefined) {
        return el('li', { className: 'mob-rank__item' }, ...body);
      }
      const button = el(
        'button',
        { className: 'mob-rank__button', attrs: { type: 'button' } },
        ...body,
      );
      button.addEventListener('click', onSelect);
      return el('li', { className: 'mob-rank__item' }, button);
    }),
  );
}
