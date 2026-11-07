import { el, nextId } from '../dom';
import { icon } from '../icons';

export interface DropdownOption {
  readonly value: string;
  readonly text: string;
}

export interface DropdownOptions {
  readonly labelText: string;
  readonly options: readonly DropdownOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export interface Dropdown {
  readonly element: HTMLElement;
  setOptions(options: readonly DropdownOption[], value: string): void;
}

export function createDropdown(config: DropdownOptions): Dropdown {
  const listId = nextId('dropdown-list');
  let options = config.options;
  let value = config.value;
  let open = false;

  const text = el('span', { className: 'dropdown__text' });
  const button = el(
    'button',
    {
      className: 'dropdown__button',
      attrs: {
        type: 'button',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'aria-controls': listId,
      },
    },
    text,
    icon('chevron-down'),
  );
  const list = el('div', {
    className: 'dropdown__list',
    attrs: { id: listId, role: 'listbox', 'aria-label': config.labelText, hidden: '' },
  });
  const element = el('div', { className: 'dropdown' }, button, list);

  const items = (): HTMLElement[] =>
    Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));

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

  function choose(next: string): void {
    value = next;
    render();
    close(true);
    config.onChange(next);
  }

  function render(): void {
    text.textContent = options.find((option) => option.value === value)?.text ?? '';
    list.replaceChildren(
      ...options.map((option) => {
        const selected = option.value === value;
        const item = el(
          'div',
          {
            className: 'dropdown__option',
            attrs: { role: 'option', tabindex: '-1', 'aria-selected': selected ? 'true' : 'false' },
          },
          el('span', { text: option.text }),
          selected && icon('check'),
        );
        item.addEventListener('click', () => {
          choose(option.value);
        });
        return item;
      }),
    );
  }

  function openList(): void {
    open = true;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    const all = items();
    (all.find((item) => item.getAttribute('aria-selected') === 'true') ?? all[0])?.focus();
  }

  button.addEventListener('click', () => {
    if (open) {
      close(true);
    } else {
      openList();
    }
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      openList();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  });
  list.addEventListener('keydown', (event) => {
    const all = items();
    const index = all.findIndex((item) => item === document.activeElement);
    const move = (target: number): void => {
      event.preventDefault();
      all[(target + all.length) % all.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        move(index + 1);
        break;
      case 'ArrowUp':
        move(index - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(all.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        all[index]?.click();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  });

  render();
  return {
    element,
    setOptions: (next, current) => {
      options = next;
      value = current;
      render();
    },
  };
}
