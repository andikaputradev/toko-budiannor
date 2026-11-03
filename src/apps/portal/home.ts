import { el, nextId } from '../../shared/dom';
import { label } from '../../shared/messages';
import { createChip } from '../../shared/ui/chip';
import {
  builtIn,
  ECOSYSTEM_LABELS,
  ECOSYSTEMS,
  FLOWS,
  missingScreens,
  openRoute,
  SCREENS,
  screensIn,
  type Ecosystem,
} from './catalog';

const OPEN_LINKS: Readonly<
  Record<
    Ecosystem,
    readonly (readonly [string, 'bukaPos' | 'bukaBo' | 'bukaOwner' | 'bukaSales'])[]
  >
> = {
  pos: [['#/pos', 'bukaPos']],
  bo: [['#/bo', 'bukaBo']],
  mobile: [
    ['#/owner', 'bukaOwner'],
    ['#/sales', 'bukaSales'],
  ],
};

const DESCRIPTIONS: Readonly<
  Record<Ecosystem, 'deskripsiPos' | 'deskripsiBo' | 'deskripsiMobile'>
> = {
  pos: 'deskripsiPos',
  bo: 'deskripsiBo',
  mobile: 'deskripsiMobile',
};

export function renderHome(root: HTMLElement): () => void {
  let filter: Ecosystem | 'semua' = 'semua';
  let text = '';
  const searchId = nextId('portal-cari');
  const search = el('input', {
    className: 'input',
    attrs: { id: searchId, type: 'search', autocomplete: 'off' },
  });
  const chips = el('div', {
    className: 'own-chips',
    attrs: { role: 'group', 'aria-label': label('filterEkosistem') },
  });
  const list = el('ul', { className: 'portal-screens' });
  const count = el('p', { className: 't-label', attrs: { 'aria-live': 'polite' } });

  const paintList = (): void => {
    const query = text.trim().toLowerCase();
    const rows = SCREENS.filter(
      (entry) =>
        (filter === 'semua' || entry.ecosystem === filter) &&
        (query === '' ||
          entry.id.toLowerCase().includes(query) ||
          label(entry.title).toLowerCase().includes(query)),
    );
    count.textContent = label('jumlahLayarTampil', { tampil: rows.length, total: SCREENS.length });
    list.replaceChildren(
      ...rows.map((entry) => {
        const route = openRoute(entry);
        return el(
          'li',
          { className: 'portal-screen', attrs: { 'data-screen': entry.id } },
          el('span', { className: 'portal-id', text: entry.id }),
          el('span', { className: 'portal-screen__title', text: label(entry.title) }),
          el('span', { className: 't-label', text: label(ECOSYSTEM_LABELS[entry.ecosystem]) }),
          el('span', {
            className: entry.built ? 'own-status own-status--ok' : 'own-status own-status--warn',
            text: label(entry.built ? 'statusTersedia' : 'belumDibangun'),
          }),
          el(
            'span',
            { className: 'portal-screen__actions' },
            entry.built && route !== undefined
              ? el('a', {
                  className: 'btn btn--secondary',
                  text: label('bukaLayar'),
                  attrs: { href: `#${route}`, 'aria-label': `${label('bukaLayar')} ${entry.id}` },
                })
              : false,
            el('a', {
              className: 'btn btn--secondary',
              text: label('tinjauLayar'),
              attrs: {
                href: `#/tinjau?layar=${entry.id}`,
                'aria-label': `${label('tinjauLayar')} ${entry.id}`,
              },
            }),
          ),
          entry.hint === undefined
            ? false
            : el('span', { className: 't-label portal-screen__hint', text: label(entry.hint) }),
        );
      }),
    );
  };

  const paintChips = (): void => {
    chips.replaceChildren(
      createChip({
        text: label('semua'),
        selected: filter === 'semua',
        onToggle: () => {
          filter = 'semua';
          paintChips();
          paintList();
        },
      }),
      ...ECOSYSTEMS.map((eco) =>
        createChip({
          text: label(ECOSYSTEM_LABELS[eco]),
          selected: filter === eco,
          onToggle: () => {
            filter = eco;
            paintChips();
            paintList();
          },
        }),
      ),
    );
  };
  search.addEventListener('input', () => {
    text = search.value;
    paintList();
  });

  const builtTotal = SCREENS.filter((entry) => entry.built).length;
  root.replaceChildren(
    el(
      'div',
      { className: 'portal' },
      el(
        'header',
        { className: 'portal-header' },
        el('h1', { className: 'portal-title', text: label('judulPortal') }),
        el('p', { text: label('subjudulPortal', { layar: SCREENS.length, alur: FLOWS.length }) }),
        el('p', {
          className: 't-label',
          text: label('statusMockup', { tersedia: builtTotal, total: SCREENS.length }),
        }),
        el(
          'div',
          { className: 'portal-header__actions' },
          el('a', {
            className: 'btn btn--primary',
            text: label('mulaiTinjau'),
            attrs: { href: '#/tinjau' },
          }),
          el('a', {
            className: 'btn btn--secondary',
            text: label('galeriGaya'),
            attrs: { href: '#/gaya' },
          }),
        ),
      ),
      el(
        'main',
        { className: 'portal-main' },
        el(
          'section',
          { className: 'portal-section', attrs: { 'aria-labelledby': 'portal-eko' } },
          el('h2', {
            className: 't-section-title',
            text: label('ekosistem'),
            attrs: { id: 'portal-eko' },
          }),
          el(
            'div',
            { className: 'portal-eco' },
            ...ECOSYSTEMS.map((eco) =>
              el(
                'article',
                { className: 'portal-card', attrs: { 'data-ecosystem': eco } },
                el('h3', { className: 'portal-card__name', text: label(ECOSYSTEM_LABELS[eco]) }),
                el('p', { text: label(DESCRIPTIONS[eco]) }),
                el('p', {
                  className: 't-label',
                  text: label('layarTersedia', {
                    tersedia: builtIn(eco),
                    total: screensIn(eco).length,
                  }),
                }),
                el(
                  'div',
                  { className: 'portal-card__actions' },
                  ...OPEN_LINKS[eco].map(([href, key]) =>
                    el('a', { className: 'btn btn--secondary', text: label(key), attrs: { href } }),
                  ),
                ),
              ),
            ),
          ),
        ),
        el(
          'section',
          { className: 'portal-section', attrs: { 'aria-labelledby': 'portal-layar' } },
          el('h2', {
            className: 't-section-title',
            text: label('daftarLayar', { jumlah: SCREENS.length }),
            attrs: { id: 'portal-layar' },
          }),
          el(
            'div',
            { className: 'portal-filter' },
            el('label', {
              className: 'field__label',
              text: label('cariLayar'),
              attrs: { for: searchId },
            }),
            search,
          ),
          chips,
          count,
          list,
        ),
        el(
          'section',
          { className: 'portal-section', attrs: { 'aria-labelledby': 'portal-alur' } },
          el('h2', {
            className: 't-section-title',
            text: label('daftarAlur', { jumlah: FLOWS.length }),
            attrs: { id: 'portal-alur' },
          }),
          el(
            'div',
            { className: 'portal-flows' },
            ...FLOWS.map((flow) => {
              const missing = missingScreens(flow);
              return el(
                'article',
                { className: 'portal-card', attrs: { 'data-flow': flow.id } },
                el(
                  'h3',
                  { className: 'portal-card__name' },
                  el('span', { className: 'portal-id', text: flow.id }),
                  el('span', { text: label(flow.title) }),
                ),
                el('p', {
                  className: 't-label',
                  text: flow.steps.map((step) => step.screen).join(' > '),
                }),
                el('p', {
                  className:
                    missing.length === 0
                      ? 'own-status own-status--ok'
                      : 'own-status own-status--warn',
                  text:
                    missing.length === 0
                      ? label('alurLengkap')
                      : label('alurSebagian', { layar: missing.join(', ') }),
                }),
                el('a', {
                  className: 'btn btn--primary',
                  text: label('mulaiAlur'),
                  attrs: {
                    href: `#/tinjau?alur=${flow.id}`,
                    'aria-label': `${label('mulaiAlur')} ${flow.id}`,
                  },
                }),
              );
            }),
          ),
        ),
      ),
    ),
  );
  paintChips();
  paintList();
  return () => undefined;
}
