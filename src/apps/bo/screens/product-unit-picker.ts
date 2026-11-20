import { el, nextId } from '../../../shared/dom';
import { label } from '../../../shared/messages';
import {
  MAX_UNITS,
  MAX_UNIT_CODE,
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
  // Isian yang tampil dan aktif, berurutan: dipakai urutan kursor formulir Data Barang.
  focusables(): HTMLInputElement[];
}

interface RowView {
  readonly item: HTMLElement;
  readonly code: HTMLInputElement;
  readonly factor: HTMLInputElement | undefined;
  readonly base: HTMLElement | undefined;
}

const CAPTION = 'Satuan';

// Isian satuan bertingkat seperti video klien: baris pertama satuan dasar, baris kedua dan ketiga
// (`SATUAN = angka SATUAN DASAR`). Satuan DIKETIK bebas (huruf apa saja), tanpa kotak cari atau
// daftar pilihan. Baris berikutnya tampil setelah baris di atasnya lengkap.
export function createUnitPicker(options: {
  onChange(rows: readonly UnitRowDraft[]): void;
  // Dipanggil saat Enter ditekan di isian terakhir yang tampil (kursor lanjut ke isian berikutnya).
  onDone?(): void;
}): UnitPicker {
  // Isi mentah isian (belum dipangkas); normalizeRows dipakai setiap kali nilainya dibaca.
  let rows: UnitRowDraft[] = Array.from({ length: MAX_UNITS }, () => ({ code: '', factor: '' }));
  let enabled = true;
  const views: RowView[] = [];
  const root = el('div', { className: 'bo-pd-units' });

  const focusables = (): HTMLInputElement[] =>
    views
      .flatMap((view) => [view.code, view.factor])
      .filter(
        (field): field is HTMLInputElement =>
          field !== undefined && !field.disabled && !field.closest('[hidden]'),
      );

  const paint = (): void => {
    const normalized = normalizeRows(rows);
    const filled = normalized.filter((row) => row.code !== '').length;
    // Saat mengisi, satu baris kosong berikutnya ikut tampil; saat hanya melihat, hanya baris terisi
    // (satu satuan berarti dua baris di bawahnya tidak muncul).
    const shown = enabled ? visibleRows(rows) : Math.max(1, filled);
    const baseCode = normalized[0]?.code ?? '';
    views.forEach((view, index) => {
      const hasCode = (normalized[index]?.code ?? '') !== '';
      view.item.hidden = index >= shown;
      view.code.disabled = !enabled;
      if (view.factor !== undefined) {
        view.factor.disabled = !enabled || !hasCode;
      }
      if (view.base !== undefined) {
        view.base.textContent = baseCode;
      }
    });
  };

  // Baris di bawah baris yang dikosongkan ikut dikosongkan, supaya isian dan data tetap sama.
  // Isian yang sedang diketik (`editing`) tidak ditimpa, hanya konversinya yang dikosongkan.
  const settle = (editing: number): void => {
    const normalized = normalizeRows(rows);
    views.forEach((view, index) => {
      if ((normalized[index]?.code ?? '') !== '') {
        return;
      }
      const typing = index === editing;
      rows[index] = { code: typing ? (rows[index]?.code ?? '') : '', factor: '' };
      if (!typing) {
        view.code.value = '';
      }
      if (view.factor !== undefined) {
        view.factor.value = '';
      }
    });
  };

  const emit = (): void => {
    options.onChange(normalizeRows(rows));
  };

  const advance = (index: number, from: 'code' | 'factor'): void => {
    const view = views[index];
    if (from === 'code' && view?.factor !== undefined && !view.factor.disabled) {
      view.factor.focus();
      return;
    }
    const next = views[index + 1];
    if (next !== undefined && !next.item.hidden && !next.code.disabled) {
      next.code.focus();
      return;
    }
    options.onDone?.();
  };

  for (let index = 0; index < MAX_UNITS; index += 1) {
    const codeId = nextId('bo-pd-unit');
    const caption = el('label', {
      className: 'bo-pd-units__caption',
      attrs: { for: codeId },
      text: index === 0 ? CAPTION : `${CAPTION} ${String(index + 1)}`,
    });
    const code = el('input', {
      className: 'bo-pd-units__code',
      attrs: {
        id: codeId,
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        maxlength: String(MAX_UNIT_CODE),
        'aria-label': label(index === 0 ? 'boSatuanDasar' : 'boSatuanKe', {
          nomor: String(index + 1),
        }),
      },
    });
    let factor: HTMLInputElement | undefined;
    let base: HTMLElement | undefined;
    let equals: HTMLElement | undefined;
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
    }
    const item = el(
      'div',
      { className: 'bo-pd-units__row' },
      caption,
      code,
      ...(equals !== undefined && factor !== undefined && base !== undefined
        ? [equals, factor, base]
        : []),
    );

    code.addEventListener('input', () => {
      rows[index] = { code: code.value, factor: rows[index]?.factor ?? '' };
      settle(index);
      paint();
      emit();
    });
    code.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        advance(index, 'code');
      }
    });
    if (factor !== undefined) {
      const field = factor;
      field.addEventListener('input', () => {
        rows[index] = { code: rows[index]?.code ?? '', factor: field.value };
        paint();
        emit();
      });
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          advance(index, 'factor');
        }
      });
    }

    views.push({ item, code, factor, base });
    root.append(item);
  }

  paint();

  return {
    element: root,
    setRows: (next) => {
      const normalized = normalizeRows(next);
      rows = normalized.map((row) => ({ ...row }));
      views.forEach((view, index) => {
        view.code.value = normalized[index]?.code ?? '';
        view.code.removeAttribute('aria-invalid');
        if (view.factor !== undefined) {
          view.factor.value = normalized[index]?.factor ?? '';
          view.factor.removeAttribute('aria-invalid');
        }
      });
      paint();
    },
    getRows: () => normalizeRows(rows).map((row) => ({ ...row })),
    setEnabled: (value) => {
      enabled = value;
      paint();
    },
    focusables,
    markIssue: (issue) => {
      for (const view of views) {
        view.code.removeAttribute('aria-invalid');
        view.factor?.removeAttribute('aria-invalid');
      }
      if (issue === undefined) {
        return;
      }
      const view = views[issue.row];
      if (view === undefined) {
        return;
      }
      // Kode ganda ada pada isian satuan; konversi tidak sah pada isian angka.
      const target = issue.field === 'factor' ? view.factor : view.code;
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
    },
  };
}
