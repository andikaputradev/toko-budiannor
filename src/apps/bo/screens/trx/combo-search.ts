import { el, nextId } from '../../../../shared/dom';

const escapePattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Memecah nama menjadi teks biasa dan elemen mark pada kata yang cocok dengan pencarian.
export function highlight(text: string, query: string): Node[] {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
    .sort((first, second) => second.length - first.length);
  if (words.length === 0) {
    return [document.createTextNode(text)];
  }
  const parts = text.split(new RegExp(`(${words.map(escapePattern).join('|')})`, 'gi'));
  return parts
    .map((part, index) =>
      index % 2 === 1 ? el('mark', { text: part }) : document.createTextNode(part),
    )
    .filter((node) => node.textContent !== '');
}

export interface ComboOptions<T> {
  readonly find: (text: string) => readonly T[];
  readonly name: (item: T) => string;
  readonly detail: (item: T) => string;
  readonly onPick: (item: T) => void;
  readonly placeholder: string;
  // Teks saat tidak ada hasil.
  readonly emptyText: string;
  // Nama daftar hasil untuk pembaca layar.
  readonly listLabel: string;
  // Nama kolom untuk pembaca layar; dikosongkan bila kolom sudah punya label tertaut.
  readonly inputLabel?: string;
  // Banyak huruf terkecil yang membuka daftar; 0 membuka seluruh daftar saat kolom diklik.
  readonly minQuery: number;
  // Dipanggil sesudah kolom kehilangan fokus dan daftar tertutup.
  readonly onLeave?: () => void;
}

export interface Combo {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  focus(): void;
}

// Kotak "Cari/Pilih" gaya gambar klien 12: daftar hasil berisi nama dengan teks cocok disorot dan
// keterangan di bawahnya. Combobox ARIA: panah memilih, Enter mengambil, Esc menutup.
export function createCombo<T>(options: ComboOptions<T>): Combo {
  const listId = nextId('trx-opts');
  const input = el('input', {
    className: 'input bo-trx-search__input',
    attrs: {
      type: 'search',
      role: 'combobox',
      autocomplete: 'off',
      placeholder: options.placeholder,
      'aria-autocomplete': 'list',
      'aria-expanded': 'false',
      'aria-controls': listId,
      ...(options.inputLabel === undefined ? {} : { 'aria-label': options.inputLabel }),
    },
  });
  const list = el('ul', {
    className: 'bo-trx-search__list',
    // tabindex -1: daftar yang bisa digulir ikut menjadi perhentian Tab di Chrome, dan menutupnya saat
    // fokus pindah ke sana menjatuhkan fokus ke BODY. Fokus tetap di kotak cari.
    attrs: {
      id: listId,
      role: 'listbox',
      'aria-label': options.listLabel,
      tabindex: '-1',
      hidden: '',
    },
  });
  list.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  let results: readonly T[] = [];
  let active = 0;

  const close = (): void => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const mark = (): void => {
    [...list.children].forEach((child, index) => {
      const selected = index === active;
      child.setAttribute('aria-selected', selected ? 'true' : 'false');
      child.classList.toggle('is-active', selected);
      if (selected) {
        input.setAttribute('aria-activedescendant', child.id);
        child.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const pick = (item: T): void => {
    close();
    options.onPick(item);
  };

  const open = (text: string): void => {
    if (text.trim().length < options.minQuery) {
      close();
      return;
    }
    results = options.find(text);
    active = 0;
    const items =
      results.length === 0
        ? [
            el('li', {
              className: 'bo-trx-search__empty',
              text: options.emptyText,
              attrs: { role: 'option', 'aria-disabled': 'true' },
            }),
          ]
        : results.map((item, index) => {
            const row = el(
              'li',
              {
                className: 'bo-trx-search__option',
                attrs: {
                  id: `${listId}-${String(index)}`,
                  role: 'option',
                  'aria-selected': 'false',
                },
              },
              el(
                'span',
                { className: 'bo-trx-search__name' },
                ...highlight(options.name(item), text),
              ),
              el('span', { className: 'bo-trx-search__code', text: options.detail(item) }),
            );
            // mousedown dengan preventDefault menjaga fokus pada kotak cari sampai pilihan diambil.
            row.addEventListener('mousedown', (event) => {
              event.preventDefault();
              pick(item);
            });
            return row;
          });
    list.replaceChildren(...items);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    mark();
  };

  input.addEventListener('input', () => {
    open(input.value);
  });
  if (options.minQuery === 0) {
    // Daftar penuh terbuka saat kolom diklik atau mendapat fokus; menyaring baru saat mengetik.
    input.addEventListener('focus', () => {
      input.select();
      open('');
    });
    input.addEventListener('click', () => {
      if (list.hidden) {
        open('');
      }
    });
  }
  input.addEventListener('blur', () => {
    close();
    options.onLeave?.();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) {
        open(options.minQuery === 0 ? '' : input.value);
        return;
      }
      const last = Math.max(0, results.length - 1);
      if (event.key === 'ArrowDown') {
        active = active >= last ? 0 : active + 1;
      } else {
        active = active <= 0 ? last : active - 1;
      }
      mark();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = list.hidden ? undefined : results[active];
      if (chosen !== undefined) {
        pick(chosen);
      }
    }
  });

  const root = el('div', { className: 'bo-trx-search' }, input, list);
  return {
    root,
    input,
    focus: () => {
      input.focus();
    },
  };
}
