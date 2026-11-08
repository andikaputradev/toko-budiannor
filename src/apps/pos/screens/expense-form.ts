import { el, nextId } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createDropdown } from '../../../shared/ui/dropdown';
import { openModal } from '../../../shared/ui/modal';
import { createAmountEntry } from '../amount-entry';
import { validateAttachment } from '../domain/attachment';
import { EXPENSE_KINDS, EXPENSE_NOTE_MAX, expenseNumber, type ExpenseKind } from '../domain/forms';
import { failureText } from '../failure';
import { attachmentText, EXPENSE_KIND_LABELS, printExpense } from '../expense-support';
import type { Expense, PosSession } from '../pos-session';

export interface ExpenseFormOptions {
  readonly session: PosSession;
  // Dipanggil dengan id biaya yang baru tersimpan, sebelum dialog Transaksi Berhasil terbuka.
  readonly onSaved: (id: string) => void;
}

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

// Dialog Transaksi Berhasil setelah biaya tersimpan: nominal, nomor, jenis biaya, Cetak Struk, Selesai.
export function openExpenseDone(session: PosSession, expense: Expense): void {
  const handle = openModal({
    title: label('transaksiBerhasil'),
    body: el(
      'div',
      { className: 'pos-done' },
      el(
        'span',
        { className: 'pos-done__mark', attrs: { 'aria-hidden': 'true' } },
        icon('circle-check'),
      ),
      el('output', { className: 't-total pos-done__total', text: formatRupiah(expense.amount) }),
      el(
        'p',
        { className: 'pos-done__who' },
        el('strong', { text: expenseNumber(expense.id) }),
        el('span', { text: label(EXPENSE_KIND_LABELS[expense.kind]) }),
      ),
    ),
    actions: [],
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-cash__actions' },
      createButton({
        text: label('cetakStruk'),
        variant: 'secondary',
        icon: 'printer',
        onClick: () => {
          printExpense(session, expense);
        },
      }),
      createButton({
        text: label('selesai'),
        onClick: () => {
          handle.close();
        },
      }),
    ),
  );
}

// Modal Catat Biaya: jenis (dropdown), nominal (papan angka), catatan opsional 0/144, lampiran opsional.
export function openExpenseForm(options: ExpenseFormOptions): void {
  const { session, onSaved } = options;
  const noteId = nextId('biaya-catatan');
  const fileId = nextId('biaya-lampiran');
  let kind: ExpenseKind = 'bensin';
  let attachment: { name: string; size: number } | undefined;

  const error = el('p', { className: 'pos-expense-form__error', attrs: { role: 'alert' } });
  const dropdown = createDropdown({
    labelText: label('jenisBiaya'),
    options: EXPENSE_KINDS.map((value) => ({
      value,
      text: label(EXPENSE_KIND_LABELS[value]),
    })),
    value: kind,
    onChange: (value) => {
      kind = EXPENSE_KINDS.find((item) => item === value) ?? kind;
      error.textContent = '';
    },
  });
  const entry = createAmountEntry({
    labelText: label('nominalPembayaran'),
    onChange: () => {
      error.textContent = '';
    },
  });
  const note = el('textarea', {
    className: 'input pos-expense-form__note',
    attrs: { id: noteId, rows: '3', maxlength: String(EXPENSE_NOTE_MAX) },
  });
  const counter = el('output', {
    className: 'pos-expense-form__counter t-label',
    attrs: { 'aria-live': 'polite' },
    text: `0/${String(EXPENSE_NOTE_MAX)}`,
  });
  note.addEventListener('input', () => {
    if (note.value.length > EXPENSE_NOTE_MAX) {
      note.value = note.value.slice(0, EXPENSE_NOTE_MAX);
    }
    counter.textContent = `${String(note.value.length)}/${String(EXPENSE_NOTE_MAX)}`;
    error.textContent = '';
  });

  const input = el('input', {
    className: 'visually-hidden',
    attrs: {
      type: 'file',
      id: fileId,
      accept: '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf',
      tabindex: '-1',
    },
  });
  const fileName = el('span', { className: 'pos-expense-form__file' });
  const fileError = el('p', {
    className: 'pos-expense-form__file-error',
    attrs: { role: 'alert' },
  });
  const removeFile = createButton({
    text: label('hapus'),
    variant: 'secondary',
    onClick: () => {
      input.value = '';
      attachment = undefined;
      paintFile();
    },
  });
  const pickFile = createButton({
    text: label('pilihBerkas'),
    variant: 'secondary',
    icon: 'paperclip',
    onClick: () => {
      input.click();
    },
  });
  function paintFile(): void {
    fileName.textContent = attachment === undefined ? '' : attachmentText(attachment);
    removeFile.hidden = attachment === undefined;
  }
  input.addEventListener('change', () => {
    fileError.textContent = '';
    const picked = input.files?.[0];
    if (picked === undefined) {
      attachment = undefined;
      paintFile();
      return;
    }
    const check = validateAttachment({ name: picked.name, size: picked.size, type: picked.type });
    if (check === 'ok') {
      attachment = { name: picked.name, size: picked.size };
    } else {
      input.value = '';
      attachment = undefined;
      fileError.textContent = label(
        check === 'format' ? 'lampiranFormatSalah' : 'lampiranTerlaluBesar',
      );
    }
    paintFile();
  });

  const handle = openModal({
    title: label('catatBiaya'),
    body: el(
      'div',
      { className: 'pos-expense-form' },
      el(
        'div',
        { className: 'pos-expense-form__col' },
        el(
          'div',
          { className: 'pos-expense-form__field' },
          el('p', { className: 'field__label', text: label('jenisBiaya') }),
          dropdown.element,
        ),
        entry.element,
      ),
      el(
        'div',
        { className: 'pos-expense-form__col' },
        el(
          'div',
          { className: 'pos-expense-form__field' },
          el('label', {
            className: 'field__label',
            text: label('catatanOpsional'),
            attrs: { for: noteId },
          }),
          note,
          counter,
        ),
        el(
          'div',
          { className: 'pos-expense-form__field' },
          el('label', {
            className: 'field__label',
            text: label('lampiranOpsional'),
            attrs: { for: fileId },
          }),
          input,
          el('div', { className: 'pos-expense-form__pick' }, pickFile, fileName, removeFile),
          el('p', { className: 't-label', text: label('petunjukLampiran') }),
          fileError,
        ),
      ),
    ),
    actions: [],
  });
  entry.listenOn(handle.dialog);

  const submit = (): void => {
    error.textContent = '';
    const result = session.saveExpense(kind, note.value, entry.value(), attachment);
    if (result.ok) {
      const saved = session.state().expenses.at(-1);
      handle.close();
      if (saved !== undefined) {
        onSaved(saved.id);
        openExpenseDone(session, saved);
      }
      return;
    }
    error.textContent = failureText(result);
  };
  handle.dialog.addEventListener('keydown', (event) => {
    if (isPc() && event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      submit();
    }
  });
  handle.dialog.append(
    error,
    el(
      'div',
      { className: 'pos-expense-form__actions' },
      createButton({
        text: label('batal'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({ text: label('simpan'), onClick: submit }),
    ),
  );
  paintFile();
}
