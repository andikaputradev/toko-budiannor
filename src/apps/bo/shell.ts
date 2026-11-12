import { el } from '../../shared/dom';
import { formatDayDateTime } from '../../shared/format';
import { icon } from '../../shared/icons';
import { label, message, type LabelKey } from '../../shared/messages';
import { createBanner } from '../../shared/ui/banner';
import type { Role } from '../../shared/data/types';
import type { BoSession } from './bo-session';
import { entryFor, groupFor, menuFor, type MenuEntry, type MenuGroup } from './domain/menu';
import { countBelowMinimum } from './domain/stock-view';
import { tabTitleKey } from './domain/tabs';

export interface Shell {
  readonly element: HTMLElement;
  // Tempat bilah tab, tepat di bawah header.
  readonly tabsHost: HTMLElement;
  // Isi halaman (panel tab).
  readonly content: HTMLElement;
  // Memperbarui judul, breadcrumb, dan penanda menu aktif; menutup laci menu.
  setPage(path: string): void;
  destroy(): void;
}

const ROLE_LABELS: Readonly<Record<Role, LabelKey>> = {
  owner: 'peranOwner',
  supervisor: 'peranSupervisor',
  kasir: 'peranKasir',
  frontliner: 'peranFrontliner',
  sales: 'peranSales',
};

const MINIMUM_PATH = '/bo/stok?filter=minimum';

function samePath(left: string, right: string): boolean {
  return left.split('?')[0] === right.split('?')[0];
}

export function createShell(session: BoSession, go: (path: string) => void): Shell {
  const store = session.store;
  let activePath = '';

  const sidebar = el('aside', {
    className: 'bo-sidebar bo-menu',
    attrs: { id: 'bo-sidebar', 'aria-label': label('menuBackOffice') },
  });
  sidebar.inert = true;
  const scrim = el('div', { className: 'bo-scrim' });

  const banner = el('div', { className: 'bo-banner' });
  const content = el('div', { className: 'bo-content__inner' });
  const breadcrumbEl = el('span', { className: 'bo-topbar__breadcrumb' });
  const titleEl = el('h1', { className: 'bo-topbar__title t-screen-title' });
  const dateEl = el('span', { className: 'bo-topbar__date' });
  const userEl = el('div', { className: 'bo-topbar__user' });
  const tabsHost = el('div', { className: 'bo-tabs' });

  const skip = el('a', {
    className: 'skip-link',
    text: label('lewatiKonten'),
    attrs: { href: '#bo-main' },
  });

  const main = el(
    'main',
    { className: 'bo-content', attrs: { id: 'bo-main', tabindex: '-1' } },
    banner,
    content,
  );
  const body = el('div', { className: 'bo-body' }, main);

  let resettingFocus = false;
  const onFocusOut = (event: FocusEvent): void => {
    if (event.relatedTarget === null && !resettingFocus) {
      resettingFocus = true;
      try {
        const dummy = document.createElement('div');
        dummy.tabIndex = 0;
        document.body.prepend(dummy);
        dummy.focus();
        dummy.remove();
      } finally {
        resettingFocus = false;
      }
    }
  };
  document.addEventListener('focusout', onFocusOut);

  // Laci menu: tersembunyi sampai titik tiga di kiri atas diklik.
  const menuToggle = el(
    'button',
    {
      className: 'bo-icon-button bo-menu-toggle',
      attrs: {
        type: 'button',
        'aria-label': label('boBukaMenu'),
        'aria-controls': 'bo-sidebar',
        'aria-expanded': 'false',
      },
    },
    icon('ellipsis-vertical'),
  );
  const isDrawerOpen = (): boolean => sidebar.classList.contains('bo-sidebar--open');
  const setDrawer = (open: boolean, restoreFocus = false): void => {
    sidebar.classList.toggle('bo-sidebar--open', open);
    sidebar.inert = !open;
    scrim.classList.toggle('bo-scrim--open', open);
    // Selagi laci terbuka, isi halaman dan tab tidak bisa dijangkau papan ketik.
    body.inert = open;
    tabsHost.inert = open;
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', label(open ? 'boTutupMenu' : 'boBukaMenu'));
    if (open) {
      (
        sidebar.querySelector<HTMLElement>('.bo-menu__link--active') ??
        sidebar.querySelector<HTMLElement>('.bo-menu__group-header')
      )?.focus();
    } else if (restoreFocus) {
      menuToggle.focus();
    }
  };
  menuToggle.addEventListener('click', () => {
    setDrawer(!isDrawerOpen(), true);
  });
  scrim.addEventListener('click', () => {
    setDrawer(false);
  });
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && isDrawerOpen()) {
      setDrawer(false, true);
    }
  };
  document.addEventListener('keydown', onEscape);

  const header = el(
    'header',
    { className: 'bo-topbar' },
    el(
      'div',
      { className: 'bo-topbar__start' },
      menuToggle,
      el('div', { className: 'bo-topbar__titles' }, breadcrumbEl, titleEl),
    ),
    el(
      'div',
      { className: 'bo-topbar__end' },
      el('div', { className: 'bo-topbar__date-pill' }, icon('calendar'), dateEl),
      userEl,
    ),
  );

  const brand = el(
    'div',
    { className: 'bo-brand' },
    el(
      'div',
      { className: 'bo-brand__header' },
      el('span', { className: 'bo-brand__mark' }, icon('store')),
      el(
        'div',
        { className: 'bo-brand__text' },
        el('strong', { className: 'bo-brand__name', text: label('tokoNama') }),
        el('span', { className: 'bo-brand__badge', text: label('backOffice') }),
      ),
    ),
  );

  const nav = el('nav', {
    className: 'bo-nav',
    attrs: { 'aria-label': label('menuBackOffice') },
  });

  // Baris terakhir laci: Keluar (log off).
  const logout = el(
    'button',
    { className: 'bo-menu__logout', attrs: { type: 'button' } },
    icon('log-out'),
    el('span', { text: label('keluar') }),
  );
  logout.addEventListener('click', () => {
    session.logout();
    go('/bo');
  });
  const footer = el('div', { className: 'bo-menu__footer' }, logout);

  sidebar.replaceChildren(brand, nav, footer);

  const element = el('div', { className: 'bo' }, skip, header, sidebar, scrim, tabsHost, body);

  const focusMain = (event: Event): void => {
    event.preventDefault();
    main.focus();
  };
  skip.addEventListener('click', focusMain);
  skip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      focusMain(event);
    }
  });

  // Status lipat per grup menu. Lipatan memakai kelas supaya bisa dianimasikan.
  const openGroups = new Set<string>(['dashboard']);

  const countFor = (entry: MenuEntry): number =>
    entry.path === MINIMUM_PATH ? countBelowMinimum(store.getState().data.products) : 0;

  const buildEntry = (entry: MenuEntry): HTMLElement => {
    const isEntryActive = samePath(entry.path, activePath);
    const count = countFor(entry);
    const link = el(
      'a',
      {
        className: `bo-menu__link ${isEntryActive ? 'bo-menu__link--active' : ''}`,
        attrs: {
          href: `#${entry.path}`,
          'aria-current': isEntryActive ? 'page' : false,
        },
      },
      el('span', { text: label(entry.label) }),
      count > 0 && el('span', { className: 'bo-menu__count', text: String(count) }),
    );
    link.addEventListener('click', () => {
      setDrawer(false);
    });
    return el('li', { className: 'bo-menu__item' }, link);
  };

  const buildGroup = (group: MenuGroup): HTMLElement => {
    const hasActiveChild = group.entries.some((entry) => samePath(entry.path, activePath));
    const isOpen = openGroups.has(group.id);
    const listId = `bo-menu-${group.id}`;
    const chevron = icon('chevron-down');
    chevron.classList.add('bo-menu__chevron');

    const groupToggle = el(
      'button',
      {
        className: `bo-menu__group-header ${hasActiveChild ? 'bo-menu__group-header--active' : ''}`,
        attrs: {
          type: 'button',
          'aria-expanded': isOpen ? 'true' : 'false',
          'aria-controls': listId,
        },
      },
      el(
        'span',
        { className: 'bo-menu__group-title' },
        icon(group.icon),
        el('span', { text: label(group.label) }),
      ),
      chevron,
    );

    const collapse = el(
      'div',
      { className: 'bo-menu__collapse', attrs: { id: listId } },
      el('ul', { className: 'bo-menu__list' }, ...group.entries.map(buildEntry)),
    );
    collapse.inert = !isOpen;

    const wrapper = el(
      'div',
      { className: `bo-menu__group ${isOpen ? 'bo-menu__group--open' : ''}` },
      groupToggle,
      collapse,
    );

    groupToggle.addEventListener('click', () => {
      const open = !openGroups.has(group.id);
      if (open) {
        openGroups.add(group.id);
      } else {
        openGroups.delete(group.id);
      }
      wrapper.classList.toggle('bo-menu__group--open', open);
      groupToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      collapse.inert = !open;
    });
    return wrapper;
  };

  let navSignature = '';
  const renderNav = (groups: readonly MenuGroup[]): void => {
    const signature = `${activePath}|${groups
      .map(
        (group) => `${group.id}:${group.entries.map((entry) => String(countFor(entry))).join(',')}`,
      )
      .join('|')}`;
    if (signature === navSignature) {
      return;
    }
    navSignature = signature;
    nav.replaceChildren(...groups.map(buildGroup));
  };

  const render = (): void => {
    const state = store.getState();
    const current = session.state().user;
    const groups = menuFor(state.role);

    dateEl.textContent = formatDayDateTime(session.now());

    const entry = entryFor(activePath);
    const group = entry === undefined ? undefined : groupFor(entry.group);
    const titleKey = tabTitleKey(activePath);
    breadcrumbEl.textContent = group === undefined ? '' : `${label(group.label)} /`;
    titleEl.textContent = titleKey === undefined ? label('menuBackOffice') : label(titleKey);

    userEl.replaceChildren(
      el('div', { className: 'bo-user-avatar' }, icon('user-round')),
      el(
        'div',
        { className: 'bo-user-info' },
        el('strong', {
          className: 'bo-user-name',
          text: current ? current.name : label('namaPengguna'),
        }),
        el('span', { className: 'bo-user-role', text: label(ROLE_LABELS[state.role]) }),
      ),
    );

    renderNav(groups);
    banner.replaceChildren(...(state.online ? [] : [createBanner('danger', message('MSG-001'))]));
  };

  const setPage = (path: string): void => {
    activePath = path;
    const entry = entryFor(path);
    if (entry !== undefined) {
      openGroups.add(entry.group);
    }
    setDrawer(false);
    render();
  };

  const unsubscribe = store.subscribe(render);
  const interval = window.setInterval(render, 30000);
  render();

  return {
    element,
    tabsHost,
    content,
    setPage,
    destroy: () => {
      unsubscribe();
      window.clearInterval(interval);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onEscape);
    },
  };
}
