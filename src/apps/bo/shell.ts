import { el } from '../../shared/dom';
import { formatDate, formatTime } from '../../shared/format';
import { icon } from '../../shared/icons';
import { label, message, type LabelKey } from '../../shared/messages';
import { createBanner } from '../../shared/ui/banner';
import { createButton } from '../../shared/ui/button';
import type { Role } from '../../shared/data/types';
import type { BoSession } from './bo-session';
import { entryFor, groupFor, menuFor, type MenuEntry, type MenuGroup } from './domain/menu';
import { countBelowMinimum } from './domain/stock-view';
import {
  applyAppearance,
  loadMode,
  loadTheme,
  parseMode,
  parseTheme,
  POS_MODES,
  POS_THEMES,
  prefersDark,
  saveMode,
  saveTheme,
  type PosMode,
  type PosTheme,
} from '../../shared/theme';

export interface Shell {
  readonly element: HTMLElement;
  readonly content: HTMLElement;
  destroy(): void;
}

const ROLE_LABELS: Readonly<Record<Role, LabelKey>> = {
  owner: 'peranOwner',
  supervisor: 'peranSupervisor',
  kasir: 'peranKasir',
  frontliner: 'peranFrontliner',
  sales: 'peranSales',
};

const THEME_NAMES: Readonly<Record<PosTheme, LabelKey>> = {
  oranye: 'temaOranye',
  terakota: 'temaTerakota',
  teal: 'temaTeal',
  biru: 'temaBiru',
  hijau: 'temaHijau',
  ungu: 'temaUngu',
  merah: 'temaMerah',
  kuning: 'temaKuning',
};

const MODE_NAMES: Readonly<Record<PosMode, LabelKey>> = {
  otomatis: 'modeOtomatis',
  terang: 'modeTerang',
  gelap: 'modeGelap',
};

const MINIMUM_PATH = '/bo/stok?filter=minimum';

function samePath(left: string, right: string): boolean {
  return left.split('?')[0] === right.split('?')[0];
}

export function createShell(
  session: BoSession,
  activePath: string,
  go: (path: string) => void,
): Shell {
  const store = session.store;
  const currentEntry = entryFor(activePath);
  const currentGroup = currentEntry ? groupFor(currentEntry.group) : undefined;

  const sidebar = el('aside', {
    className: 'bo-sidebar bo-menu',
    attrs: { id: 'bo-sidebar', 'aria-label': label('menuBackOffice') },
  });
  const scrim = el('div', { className: 'bo-scrim' });

  const banner = el('div', { className: 'bo-banner' });
  const content = el('div', { className: 'bo-content__inner' });
  const breadcrumbEl = el('span', { className: 'bo-topbar__breadcrumb' });
  const titleEl = el('h1', { className: 'bo-topbar__title t-screen-title' });
  const dateEl = el('span', { className: 'bo-topbar__date' });
  const userProfileEl = el('div', { className: 'bo-user-profile' });

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

  // Modal Pemilih Tema & Mode
  let themeDialog: HTMLElement | undefined;
  const closeThemeDialog = (): void => {
    themeDialog?.remove();
    themeDialog = undefined;
  };

  const openThemeDialog = (): void => {
    if (themeDialog !== undefined) {
      closeThemeDialog();
      return;
    }
    const curTheme = parseTheme(document.documentElement.dataset['posTheme'] ?? loadTheme());
    const curMode = parseMode(document.documentElement.dataset['posMode'] ?? loadMode());

    const themeOptions = POS_THEMES.map((themeKey) => {
      const isSelected = themeKey === curTheme;
      const opt = el(
        'button',
        {
          className: `bo-theme-option ${isSelected ? 'bo-theme-option--selected' : ''}`,
          attrs: { type: 'button', 'aria-pressed': isSelected ? 'true' : 'false' },
        },
        el('span', {
          className: 'bo-theme-swatch',
          attrs: { 'data-app': 'bo', 'data-pos-theme': themeKey },
        }),
        el('span', { text: label(THEME_NAMES[themeKey]) }),
      );
      opt.addEventListener('click', () => {
        saveTheme(themeKey);
        applyAppearance(document.documentElement, themeKey, curMode, prefersDark());
        closeThemeDialog();
      });
      return opt;
    });

    const modeOptions = POS_MODES.map((modeKey) => {
      const isSelected = modeKey === curMode;
      const opt = el(
        'button',
        {
          className: `bo-mode-option ${isSelected ? 'bo-mode-option--selected' : ''}`,
          attrs: { type: 'button', 'aria-pressed': isSelected ? 'true' : 'false' },
        },
        el('span', { text: label(MODE_NAMES[modeKey]) }),
      );
      opt.addEventListener('click', () => {
        saveMode(modeKey);
        applyAppearance(document.documentElement, curTheme, modeKey, prefersDark());
        closeThemeDialog();
      });
      return opt;
    });

    themeDialog = el(
      'div',
      { className: 'bo-theme-popover', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      el(
        'div',
        { className: 'bo-theme-popover__header' },
        el('h3', { text: label('menuTema') }),
        createButton({
          text: label('tutup'),
          variant: 'secondary',
          onClick: closeThemeDialog,
        }),
      ),
      el('p', { className: 't-label bo-theme-popover__label', text: label('tema') }),
      el('div', { className: 'bo-theme-grid' }, ...themeOptions),
      el('p', { className: 't-label bo-theme-popover__label', text: label('modeTampilan') }),
      el('div', { className: 'bo-mode-grid' }, ...modeOptions),
    );

    document.body.append(themeDialog);
  };

  const themeButton = el(
    'button',
    {
      className: 'bo-icon-button',
      attrs: {
        type: 'button',
        'aria-label': label('menuTema'),
        title: label('menuTema'),
        'data-theme-toggle': 'true',
      },
    },
    icon('palette'),
  );
  themeButton.addEventListener('click', openThemeDialog);

  // Tombol Keluar
  const logoutBtn = createButton({
    text: label('keluar'),
    variant: 'secondary',
    icon: 'log-out',
    onClick: () => {
      session.logout();
      go('/bo');
    },
  });

  // Laci menu pada layar sempit
  const menuToggle = el(
    'button',
    {
      className: 'bo-icon-button bo-mobile-toggle',
      attrs: {
        type: 'button',
        'aria-label': label('menu'),
        'aria-controls': 'bo-sidebar',
        'aria-expanded': 'false',
      },
    },
    icon('menu'),
  );
  const setDrawer = (open: boolean): void => {
    sidebar.classList.toggle('bo-sidebar--open', open);
    scrim.classList.toggle('bo-scrim--open', open);
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  menuToggle.addEventListener('click', () => {
    setDrawer(!sidebar.classList.contains('bo-sidebar--open'));
  });
  scrim.addEventListener('click', () => {
    setDrawer(false);
  });
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && sidebar.classList.contains('bo-sidebar--open')) {
      setDrawer(false);
      menuToggle.focus();
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
      themeButton,
      logoutBtn,
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

  sidebar.replaceChildren(brand, nav, userProfileEl);

  const element = el(
    'div',
    { className: 'bo' },
    skip,
    header,
    el('div', { className: 'bo-body' }, sidebar, scrim, main),
  );

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
  const openGroups = new Set<string>();
  openGroups.add(currentGroup ? currentGroup.id : 'dashboard');

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
    const signature = groups
      .map(
        (group) => `${group.id}:${group.entries.map((entry) => String(countFor(entry))).join(',')}`,
      )
      .join('|');
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

    // Update Topbar
    dateEl.textContent = `${formatDate(session.now())}, ${formatTime(session.now())} WIB`;
    if (currentEntry) {
      const g = groupFor(currentEntry.group);
      breadcrumbEl.textContent = g ? `${label(g.label)} /` : '';
      titleEl.textContent = label(currentEntry.label);
    } else {
      breadcrumbEl.textContent = '';
      titleEl.textContent = label('menuBackOffice');
    }

    // Update User Profile di Sidebar Bawah
    const roleLabelKey = ROLE_LABELS[state.role];
    userProfileEl.replaceChildren(
      el(
        'div',
        { className: 'bo-user-card' },
        el('div', { className: 'bo-user-avatar' }, icon('user-round')),
        el(
          'div',
          { className: 'bo-user-info' },
          el('strong', {
            className: 'bo-user-name',
            text: current ? current.name : label('namaPengguna'),
          }),
          el('span', { className: 'bo-user-role', text: label(roleLabelKey) }),
        ),
      ),
    );

    renderNav(groups);
    banner.replaceChildren(...(state.online ? [] : [createBanner('danger', message('MSG-001'))]));
  };

  const unsubscribe = store.subscribe(render);
  const interval = window.setInterval(render, 30000);
  render();

  return {
    element,
    content,
    destroy: () => {
      unsubscribe();
      window.clearInterval(interval);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onEscape);
      closeThemeDialog();
    },
  };
}
