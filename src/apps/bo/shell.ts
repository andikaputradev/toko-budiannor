import { el } from '../../shared/dom';
import { formatTime } from '../../shared/format';
import { label, message, type LabelKey } from '../../shared/messages';
import { createBanner } from '../../shared/ui/banner';
import { createButton } from '../../shared/ui/button';
import type { Role } from '../../shared/data/types';
import type { BoSession } from './bo-session';
import { entryFor, menuFor } from './domain/menu';

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

export function createShell(
  session: BoSession,
  activePath: string,
  go: (path: string) => void,
): Shell {
  const store = session.store;
  const menu = el('nav', {
    className: 'bo-menu',
    attrs: { 'aria-label': label('menuBackOffice') },
  });
  const banner = el('div', { className: 'bo-banner' });
  const content = el('div', { className: 'bo-content__inner' });
  const user = el('span', { className: 'bo-topbar__user' });
  const clock = el('span', { className: 'bo-topbar__clock' });
  const title = entryFor(activePath);
  const skip = el('a', {
    className: 'skip-link',
    text: label('lewatiKonten'),
    attrs: { href: '#bo-main' },
  });

  const logout = createButton({
    text: label('keluar'),
    variant: 'secondary',
    onClick: () => {
      session.logout();
      go('/bo');
    },
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

  const element = el(
    'div',
    { className: 'bo' },
    skip,
    el(
      'header',
      { className: 'bo-topbar' },
      el(
        'div',
        { className: 'bo-topbar__brand' },
        el('strong', { text: label('tokoNama') }),
        el('span', { className: 'bo-topbar__sub', text: label('backOffice') }),
      ),
      el('p', {
        className: 'bo-topbar__title t-screen-title',
        text: title === undefined ? '' : label(title.label),
      }),
      el('div', { className: 'bo-topbar__status' }, user, clock, logout),
    ),
    el('div', { className: 'bo-body' }, menu, main),
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

  const render = (): void => {
    const state = store.getState();
    const current = session.state().user;
    user.textContent =
      current === undefined ? '' : `${current.name} (${label(ROLE_LABELS[state.role])})`;
    clock.textContent = formatTime(session.now());
    const entries = menuFor(state.role);
    const groups = [...new Set(entries.map((entry) => entry.group))];
    menu.replaceChildren(
      ...groups.map((group) =>
        el(
          'div',
          { className: 'bo-menu__group' },
          el('p', { className: 'bo-menu__heading t-label', text: label(group) }),
          el(
            'ul',
            { className: 'bo-menu__list' },
            ...entries
              .filter((entry) => entry.group === group)
              .map((entry) =>
                el(
                  'li',
                  {},
                  el('a', {
                    className: 'bo-menu__link',
                    text: label(entry.label),
                    attrs: {
                      href: `#${entry.path}`,
                      'aria-current': entry.path === activePath && 'page',
                    },
                  }),
                ),
              ),
          ),
        ),
      ),
    );
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
    },
  };
}
