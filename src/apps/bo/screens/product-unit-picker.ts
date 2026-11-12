import { el, nextId } from '../../../shared/dom';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import {
  MAX_UNITS,
  normalizeRows,
  visibleRows,
  type UnitRowDraft,
  type UnitRowsIssue,
} from '../domain/product-units';

export interface UnitPicker {
  readonly element: HTMLElement;
  setRows(rows: readonly UnitRowDraft[]): void;
  getRows(): UnitRowDraft[];
  setEnabled(enabled: boolean): void;
  // Menandai dan memfokuskan isian yang salah (mis. konversi pada baris tertentu).
  markIssue(issue: UnitRowsIssue | undefined): void;
}

interface RowView {
  readonly item: HTMLElement;
  readonly field: HTMLElement;
  readonly chip: HTMLElement;
  readonly chipText: HTMLElement;
  readonly chipRemove: HTMLButtonElement;
  readonly search: HTMLInputElement;
  readonly openButton: HTMLButtonElement;
  readonly list: HTMLElement;
  readonly equals: HTMLElement | undefined;
  readonly factor: HTMLInputElement | undefined;
  readonly base: HTMLElement | undefined;
}

// Pemilih satuan bertingkat seperti video klien: baris pertama satuan dasar, baris kedua dan ketiga
// (`SATUAN = angka SATUAN DASAR`) baru tampil setelah baris di atasnya lengkap. Setiap baris berupa
// kolom cari/pilih yang menampilkan kode terpilih sebagai chip dengan tanda silang.
export function createUnitPicker(options: {
  readonly codes: readonly string[];
  onChange(rows: readonly UnitRowDraft[]): void;
}): UnitPicker {
  let rows: UnitRowDraft[] = normalizeRows([]);
  let enabled = true;
  const views: RowView[] = [];
  const root = el('div', { className: 'bo-pd-units' });

  const emit = (): void => {
    options.onChange(rows);
  };

  const closeLists = (): void => {
    for (const view of views) {
      view.list.hidden = true;
    }
  };

  const paint = (): void => {
    const shown = visibleRows(rows);
    const baseCode = rows[0]?.code ?? '';
    views.forEach((view, index) => {
      const row = rows[index] ?? { code: '', factor: '' };
      const hasCode = row.code !== '';
      view.item.hidden = index >= shown;
      view.chip.hidden = !hasCode;
      view.chipText.textContent = row.code;
      view.chipRemove.setAttribute(
        'aria-label',
        label('boHapusSatuan', { nomor: String(index + 1), kode: row.code }),
      );
      view.chipRemove.disabled = !enabled;
      view.search.hidden = hasCode;
      view.search.disabled = !enabled || hasCode;
      view.openButton.disabled = !enabled || hasCode;
      if (view.factor !== undefined && view.factor.value !== row.factor) {
        view.factor.value = row.factor;
      }
      if (view.factor !== undefined) {
        view.factor.disabled = !enabled || !hasCode;
      }
      if (view.equals !== undefined) {
        view.equals.hidden = !hasCode;
      }
      if (view.factor !== undefined) {
        view.factor.hidden = !hasCode;
      }
      if (view.base !== undefined) {
        view.base.hidden = !hasCode;
        view.base.textContent = baseCode;
      }
    });
  };

  const setCode = (index: number, code: string): void => {
    const next = rows.map((row) => ({ ...row }));
    next[index] = { code, factor: index === 0 ? '' : (next[index]?.factor ?? '') };
    rows = normalizeRows(next);
    paint();
    emit();
    const view = views[index];
    if (view?.factor !== undefined && code !== '') {
      view.factor.focus();
    }
  };

  const fillList = (index: number, query: string): void => {
    const view = views[index];
    if (view === undefined) {
      return;
    }
    const used = new Set(rows.map((row) => row.code.toLowerCase()).filter((code) => code !== ''));
    const needle = query.trim().toLowerCase();
    const matches = options.codes
      .filter((code) => !used.has(code.toLowerCase()) && code.toLowerCase().includes(needle))
      .slice(0, 40);
    view.list.replaceChildren(
      ...matches.map((code) => {
        const option = el('li', {
          className: 'bo-pd-units__option',
          text: code,
          attrs: { role: 'option', tabindex: '-1' },
        });
        option.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        option.addEventListener('click', () => {
          closeLists();
          setCode(index, code);
        });
        option.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            option.click();
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            (option.nextElementSibling as HTMLElement | null)?.focus();
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            ((option.previousElementSibling as HTMLElement | null) ?? view.search).focus();
          } else if (event.key === 'Escape') {
            closeLists();
            view.search.focus();
          }
        });
        return option;
      }),
    );
    if (matches.length === 0) {
      view.list.replaceChildren(
        el('li', { className: 'bo-pd-units__empty', text: label('boSatuanKosong') }),
      );
    }
  };

  const openList = (index: number): void => {
    const view = views[index];
    if (view === undefined || !enabled) {
      return;
    }
    closeLists();
    fillList(index, view.search.value);
    view.list.hidden = false;
  };

  for (let index = 0; index < MAX_UNITS; index += 1) {
    const listId = nextId('bo-pd-units');
    const chipText = el('span', { className: 'bo-pd-chip__text' });
    const chipRemove = el(
      'button',
      { className: 'bo-pd-chip__remove', attrs: { type: 'button' } },
      icon('x'),
    );
    const chip = el('span', { className: 'bo-pd-chip' }, chipText, chipRemove);
    const search = el('input', {
      className: 'bo-pd-units__search',
      attrs: {
        type: 'text',
        autocomplete: 'off',
        placeholder: label('boCariPilih'),
        role: 'combobox',
        'aria-expanded': 'false',
        'aria-controls': listId,
        'aria-label': label(index === 0 ? 'boSatuanDasar' : 'boSatuanKe', {
          nomor: String(index + 1),
        }),
      },
    });
    const openButton = el(
      'button',
      {
        className: 'bo-pd-units__open',
        attrs: { type: 'button', tabindex: '-1', 'aria-label': label('boPilihSatuan') },
      },
      icon('search'),
    );
    const list = el('ul', {
      className: 'bo-pd-units__list',
      attrs: { id: listId, role: 'listbox', 'aria-label': label('boPilihSatuan') },
    });
    list.hidden = true;
    const field = el('div', { className: 'bo-pd-units__field' }, chip, search, openButton);

    let equals: HTMLElement | undefined;
    let factor: HTMLInputElement | undefined;
    let base: HTMLElement | undefined;
    if (index > 0) {
      equals = el('span', { className: 'bo-pd-units__equals', text: '=' });
      factor = el('input', {
        className: 'bo-pd-units__factor',
        attrs: {
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          'aria-label': label('boKonversiSatuan', { nomor: String(index + 1) }),
        },
      });
      base = el('span', { className: 'bo-pd-units__base' });
      const position = index;
      factor.addEventListener('input', () => {
        const next = rows.map((row) => ({ ...row }));
        next[position] = { code: next[position]?.code ?? '', factor: factor?.value ?? '' };
        const before = visibleRows(rows);
        rows = next.map((row, at) => ({ code: row.code, factor: at === 0 ? '' : row.factor }));
        // Baris berikutnya tampil bila konversi sudah sah; jangan menyusun ulang isian ini.
        if (visibleRows(rows) !== before) {
          paint();
        }
        emit();
      });
    }
    const item = el(
      'div',
      { className: 'bo-pd-units__row' },
      field,
      ...(equals !== undefined && factor !== undefined && base !== undefined
        ? [equals, factor, base]
        : []),
      list,
    );

    chipRemove.addEventListener('click', () => {
      setCode(index, '');
      views[index]?.search.focus();
    });
    openButton.addEventListener('click', () => {
      if (list.hidden) {
        openList(index);
        search.focus();
      } else {
        closeLists();
      }
    });
    search.addEventListener('focus', () => {
      openList(index);
    });
    search.addEventListener('input', () => {
      fillList(index, search.value);
      list.hidden = false;
    });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openList(index);
        (list.firstElementChild as HTMLElement | null)?.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const first = list.querySelector<HTMLElement>('[role="option"]');
        const typed = search.value.trim();
        if (first !== null) {
          first.click();
        } else if (typed !== '') {
          closeLists();
          setCode(index, typed.toUpperCase());
        }
      } else if (event.key === 'Escape') {
        closeLists();
      }
    });
    search.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (!item.contains(document.activeElement)) {
          list.hidden = true;
        }
      }, 120);
    });

    views.push({
      item,
      field,
      chip,
      chipText,
      chipRemove,
      search,
      openButton,
      list,
      equals,
      factor,
      base,
    });
    root.append(item);
  }

  paint();

  return {
    element: root,
    setRows: (next) => {
      rows = normalizeRows(next);
      closeLists();
      for (const view of views) {
        view.search.value = '';
        view.search.removeAttribute('aria-invalid');
        view.factor?.removeAttribute('aria-invalid');
      }
      paint();
    },
    getRows: () => rows.map((row) => ({ ...row })),
    setEnabled: (value) => {
      enabled = value;
      closeLists();
      paint();
    },
    markIssue: (issue) => {
      for (const view of views) {
        view.search.removeAttribute('aria-invalid');
        view.factor?.removeAttribute('aria-invalid');
        view.chipRemove.removeAttribute('aria-invalid');
        view.chip.removeAttribute('data-invalid');
      }
      if (issue === undefined) {
        return;
      }
      const view = views[issue.row];
      if (view === undefined) {
        return;
      }
      const hasCode = (rows[issue.row]?.code ?? '') !== '';
      // Kode ganda ada pada baris yang sudah terisi (chip); konversi pada isian angka.
      const target =
        issue.field === 'factor' ? view.factor : hasCode ? view.chipRemove : view.search;
      if (issue.field !== 'factor' && hasCode) {
        view.chip.setAttribute('data-invalid', 'true');
      }
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
    },
  };
}
