import { el, nextId } from '../dom';
import { icon, type IconName } from '../icons';

export interface MenuItem {
  readonly text: string;
  readonly icon?: IconName;
  readonly onSelect: () => void;
}

export interface MenuButtonOptions {
  readonly labelText: string;
  readonly items: readonly MenuItem[];
}

export function createMenuButton(config: MenuButtonOptions): HTMLElement {
  const listId = nextId('menu-list');
  let open = false;
  const button = el(
    'button',
    {
      className: 'menu__button',
      attrs: {
        type: 'button',
        'aria-label': config.labelText,
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        'aria-controls': listId,
      },
    },
    icon('ellipsis-vertical'),
  );
  const list = el('div', {
    className: 'menu__list',
    attrs: { id: listId, role: 'menu', 'aria-label': config.labelText, hidden: '' },
  });
  const element = el('div', { className: 'menu' }, button, list);

  const items = (): HTMLElement[] =>
    Array.from(list.querySelectorAll<HTMLElement>('[role="menuitem"]'));

  const onOutside = (event: Event): void => {
    if (!(event.target instanceof Node) || !element.contains(event.target)) {
      close(false);
    }
  };

  function close(restoreFocus: boolean): void {
    if (!open) {
      return;
    }
    open = false;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (restoreFocus) {
      button.focus();
    }
  }

  for (const item of config.items) {
    const entry = el(
      'button',
      { className: 'menu__item', attrs: { type: 'button', role: 'menuitem', tabindex: '-1' } },
      item.icon !== undefined && icon(item.icon),
      el('span', { text: item.text }),
    );
    entry.addEventListener('click', () => {
      close(false);
      item.onSelect();
    });
    list.append(entry);
  }

  button.addEventListener('click', () => {
    if (open) {
      close(true);
      return;
    }
    open = true;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    items()[0]?.focus();
  });
  list.addEventListener('keydown', (event) => {
    const all = items();
    const index = all.findIndex((item) => item === document.activeElement);
    const move = (target: number): void => {
      event.preventDefault();
      all[(target + all.length) % all.length]?.focus();
    };
    if (event.key === 'ArrowDown') {
      move(index + 1);
    } else if (event.key === 'ArrowUp') {
      move(index - 1);
    } else if (event.key === 'Home') {
      move(0);
    } else if (event.key === 'End') {
      move(all.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    }
  });
  return element;
}
