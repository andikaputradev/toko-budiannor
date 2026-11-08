import { append, el } from '../../../shared/dom';
import { formatDate, formatRupiah, formatTime } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { expenseNumber } from '../domain/forms';
import { attachmentText, EXPENSE_KIND_LABELS, printExpense } from '../expense-support';
import type { Expense, PosSession } from '../pos-session';
import { createSplitPane } from '../split';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';
import { guardWithShift } from './shift';

function stamp(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(date)} ${formatTime(date)}`;
}

// POS-07 Biaya: daftar biaya dengan kolom cari dan tombol bulat tambah di kiri, Informasi Biaya di kanan.
// Tombol tambah membuka modal Catat Biaya (dimuat malas).
export function renderExpense(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulBiaya');
  let selectedId: string | undefined;
  let query = '';

  const search = el('input', {
    className: 'input pos-search__input pos-expense__search',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      placeholder: label('cariTransaksi'),
      'aria-label': label('cariTransaksi'),
    },
  });
  const listBox = el('div', { className: 'pos-expense__rows' });
  const detail = el('section', { className: 'pos-expense-detail' });
  const add = el(
    'button',
    {
      className: 'pos-fab',
      attrs: { type: 'button', 'aria-label': label('catatBiaya') },
    },
    icon('plus'),
  );
  add.addEventListener('click', () => {
    void import('./expense-form').then(({ openExpenseForm }) => {
      openExpenseForm({
        session,
        onSaved: (id) => {
          selectedId = id;
          render();
        },
      });
    });
  });

  const listSection = el(
    'section',
    { className: 'pos-expense__main' },
    el('div', { className: 'pos-search' }, icon('search'), search),
    listBox,
    add,
  );
  const pane = createSplitPane({
    list: listSection,
    detail,
    backLabel: 'kembali',
    className: 'pos-expense',
  });

  const matches = (item: Expense): boolean => {
    const needle = query.trim().toLowerCase();
    return (
      needle === '' ||
      [expenseNumber(item.id), label(EXPENSE_KIND_LABELS[item.kind]), item.note].some((text) =>
        text.toLowerCase().includes(needle),
      )
    );
  };

  const row = (item: Expense): HTMLElement => {
    const button = el(
      'button',
      {
        className: 'pos-expense-row',
        attrs: { type: 'button', 'aria-pressed': item.id === selectedId ? 'true' : 'false' },
      },
      el(
        'span',
        { className: 'pos-expense-row__who' },
        el('strong', { text: label(EXPENSE_KIND_LABELS[item.kind]) }),
        el('span', { className: 't-label', text: `${expenseNumber(item.id)}, ${stamp(item.at)}` }),
      ),
      el('output', { className: 'pos-expense-row__amount', text: formatRupiah(item.amount) }),
    );
    button.addEventListener('click', () => {
      selectedId = item.id;
      render();
      pane.showDetail();
    });
    return button;
  };

  const detailRow = (key: string, text: string, value: string): HTMLElement =>
    el(
      'p',
      { className: 'pos-expense-detail__row', attrs: { 'data-row': key } },
      el('span', { className: 't-label', text }),
      el('strong', { text: value }),
    );

  const renderDetail = (item: Expense | undefined): void => {
    if (item === undefined) {
      detail.replaceChildren(createEmptyState({ icon: 'inbox', title: label('tidakAdaData') }));
      return;
    }
    const print = createButton({
      text: label('cetakStruk'),
      variant: 'secondary',
      icon: 'printer',
      onClick: () => {
        printExpense(session, item);
      },
    });
    detail.replaceChildren();
    append(detail, [
      el('h2', { className: 't-section-title', text: label('informasiBiaya') }),
      detailRow('nomor', label('nomorPembayaran'), expenseNumber(item.id)),
      detailRow('dibuat-oleh', label('dibuatOleh'), session.userName(item.userId)),
      detailRow('jenis', label('jenisBiaya'), label(EXPENSE_KIND_LABELS[item.kind])),
      detailRow('nominal', label('nominalPembayaran'), formatRupiah(item.amount)),
      detailRow('tanggal', label('tanggalPembayaran'), stamp(item.at)),
      detailRow('catatan', label('catatan'), item.note === '' ? '-' : item.note),
      item.attachment === undefined
        ? false
        : detailRow('lampiran', label('lampiran'), attachmentText(item.attachment)),
      print,
    ]);
  };

  function render(): void {
    const all = [...session.state().expenses].reverse();
    const selected = all.find((item) => item.id === selectedId) ?? all[0];
    selectedId = selected?.id;
    const shown = all.filter(matches);
    listBox.replaceChildren(
      ...(shown.length === 0
        ? [
            createEmptyState({
              icon: all.length === 0 ? 'inbox' : 'search',
              title: label(all.length === 0 ? 'belumAdaBiaya' : 'tidakAdaData'),
            }),
          ]
        : shown.map(row)),
    );
    renderDetail(selected);
  }

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') === null && event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = session.subscribe(render);

  const element = el('div', { className: 'pos' }, topbar.element, pane.element);
  const unguard = guardWithShift(session, element);
  render();
  return {
    element,
    destroy: () => {
      unguard();
      stop();
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
