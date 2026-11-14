import { el } from '../../shared/dom';
import { icon } from '../../shared/icons';
import { label } from '../../shared/messages';
import { DASHBOARD_PATH, type TabEntry, type TabState } from './domain/tabs';

export interface TabStrip {
  readonly element: HTMLElement;
  render(state: TabState, titleOf: (entry: TabEntry) => string): void;
  focusActive(): void;
  destroy(): void;
}

// Bilah tab halaman. Setiap tab adalah tautan ke rutenya (navigasi hash), bukan peran `tab` ARIA,
// karena tombol tutup bersaudara dengan tautan dan tab tidak mengatur panel satu halaman.
export function createTabStrip(options: { onClose(key: string): void }): TabStrip {
  const list = el('ul', { className: 'bo-tabs__list' });
  const nav = el(
    'nav',
    { className: 'bo-tabs__nav', attrs: { 'aria-label': label('boHalamanTab') } },
    list,
  );
  const count = el('span', { className: 'bo-tabs__count' });
  const more = el(
    'button',
    {
      className: 'bo-tabs__more',
      attrs: {
        type: 'button',
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
      },
    },
    count,
    icon('chevron-down'),
  );
  const menuList = el('ul', { className: 'bo-tabs__menu-list' });
  const menu = el(
    'div',
    { className: 'bo-tabs__menu', attrs: { 'aria-label': label('boDaftarTab') } },
    menuList,
  );
  menu.hidden = true;
  const element = el('div', { className: 'bo-tabs__bar' }, nav, more, menu);

  const closeMenu = (): void => {
    menu.hidden = true;
    more.setAttribute('aria-expanded', 'false');
  };
  const openMenu = (): void => {
    menu.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    menuList.querySelector<HTMLElement>('a')?.focus();
  };
  more.addEventListener('click', () => {
    if (menu.hidden) {
      openMenu();
    } else {
      closeMenu();
    }
  });
  const onDocumentClick = (event: MouseEvent): void => {
    if (!menu.hidden && !element.contains(event.target as Node)) {
      closeMenu();
    }
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
      more.focus();
    }
  };
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);

  // Roda tetikus vertikal di atas bilah menggeser tab mendatar.
  list.addEventListener(
    'wheel',
    (event) => {
      if (list.scrollWidth > list.clientWidth && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        list.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    },
    { passive: false },
  );

  let activeLink: HTMLElement | undefined;

  const scrollToActive = (item: HTMLElement): void => {
    const left = item.offsetLeft;
    const right = left + item.offsetWidth;
    if (left < list.scrollLeft) {
      list.scrollLeft = left;
    } else if (right > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = right - list.clientWidth;
    }
  };

  const render = (state: TabState, titleOf: (entry: TabEntry) => string): void => {
    const items = state.tabs.map((entry) => {
      const active = entry.key === state.activeKey;
      const title = titleOf(entry);
      const link = el(
        'a',
        {
          className: 'bo-tab__link',
          attrs: { href: `#${entry.path}`, 'aria-current': active ? 'page' : false, title },
        },
        el('span', { className: 'bo-tab__title', text: title }),
      );
      const item = el(
        'li',
        { className: `bo-tab${active ? ' bo-tab--active' : ''}` },
        link,
        entry.key !== DASHBOARD_PATH &&
          el(
            'button',
            {
              className: 'bo-tab__close',
              attrs: { type: 'button', 'aria-label': label('boTabTutup', { nama: title }) },
            },
            icon('x'),
          ),
      );
      item.querySelector('.bo-tab__close')?.addEventListener('click', () => {
        options.onClose(entry.key);
      });
      return item;
    });
    list.replaceChildren(...items);
    const activeItem = items[state.tabs.findIndex((entry) => entry.key === state.activeKey)];
    activeLink = activeItem?.querySelector<HTMLElement>('.bo-tab__link') ?? undefined;

    count.textContent = String(state.tabs.length);
    // Nama aksesibel memuat teks yang terlihat (angka jumlah tab).
    more.setAttribute('aria-label', `${String(state.tabs.length)} ${label('boTabSemua')}`);
    menuList.replaceChildren(
      ...state.tabs.map((entry) => {
        const active = entry.key === state.activeKey;
        const link = el('a', {
          className: `bo-tabs__menu-link${active ? ' bo-tabs__menu-link--active' : ''}`,
          text: titleOf(entry),
          attrs: { href: `#${entry.path}`, 'aria-current': active ? 'page' : false },
        });
        link.addEventListener('click', closeMenu);
        return el('li', {}, link);
      }),
    );
    more.hidden = state.tabs.length < 2;
    if (activeItem !== undefined) {
      scrollToActive(activeItem);
    }
  };

  return {
    element,
    render,
    focusActive: () => {
      activeLink?.focus();
    },
    destroy: () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeydown);
    },
  };
}
