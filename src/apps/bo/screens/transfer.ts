import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatTime } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { fromBase } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { createSelectField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import { type TransferLineDraft } from '../domain/transfer';
import { createProductPicker } from '../picker';
import type { ScreenHandle } from './login';

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function preferredUnit(product: Product): string {
  const packaged = product.units[1];
  return (
    product.defaultUnit ??
    (product.baseUnit === 'Kg' && packaged !== undefined ? packaged.code : product.baseUnit)
  );
}

export function renderTransfer(session: BoSession): ScreenHandle {
  const store = session.store;
  let from: WarehouseId = 'besar';
  let to: WarehouseId = 'display';
  let lines: TransferLineDraft[] = [];

  const options = [
    { value: 'display', text: label('namaGudangDisplay') },
    { value: 'besar', text: label('namaGudangBesar') },
  ];
  const fromField = createSelectField({ labelText: label('gudangAsal'), options, value: from });
  const toField = createSelectField({ labelText: label('gudangTujuan'), options, value: to });
  const dateOutput = el('output', { className: 't-value' });
  const numberOutput = el('output', { className: 't-value' });
  const error = el('p', { className: 'bo-error', attrs: { role: 'alert' } });
  const tableBox = el('div', { className: 'bo-panel bo-transfer-table' });
  const historyBox = el('section', { className: 'bo-panel' });

  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);

  const picker = createProductPicker({
    labelText: label('cariBarang'),
    products: () => store.getState().data.products,
    onPick: (product) => {
      const unit = preferredUnit(product);
      const existing = lines.findIndex(
        (line) => line.productId === product.id && line.unit === unit,
      );
      if (existing >= 0) {
        lines = lines.map((line, index) =>
          index === existing
            ? {
                ...line,
                quantity: String(Number(line.quantity.replace(',', '.') || '0') + 1).replace(
                  '.',
                  ',',
                ),
              }
            : line,
        );
      } else {
        lines = [...lines, { productId: product.id, unit, quantity: '1' }];
      }
      error.textContent = '';
      renderTable();
    },
  });
  picker.root.classList.add('bo-picker--wide');

  const renderTable = (): void => {
    const body = el('tbody');
    lines.forEach((line, index) => {
      const product = lookup(line.productId);
      if (product === undefined) {
        return;
      }
      const quantity = el('input', {
        className: 'input bo-cell-input',
        attrs: {
          inputmode: 'decimal',
          autocomplete: 'off',
          'aria-label': `${label('jumlahMutasi')} ${product.name}`,
          'data-line': String(index),
        },
      });
      quantity.value = line.quantity;
      quantity.addEventListener('input', () => {
        lines = lines.map((item, position) =>
          position === index ? { ...item, quantity: quantity.value } : item,
        );
        error.textContent = '';
        quantity.removeAttribute('aria-invalid');
      });
      const unit = el(
        'select',
        {
          className: 'input bo-cell-input',
          attrs: { 'aria-label': `${label('kolomSatuan')} ${product.name}` },
        },
        ...product.units.map((item) =>
          el('option', { text: item.code, attrs: { value: item.code } }),
        ),
      );
      unit.value = line.unit;
      unit.addEventListener('change', () => {
        lines = lines.map((item, position) =>
          position === index ? { ...item, unit: unit.value } : item,
        );
        renderTable();
      });
      const remove = createButton({
        text: label('hapus'),
        variant: 'secondary',
        onClick: () => {
          lines = lines.filter((_, position) => position !== index);
          renderTable();
        },
      });
      remove.setAttribute('aria-label', `${label('hapus')} ${product.name}`);
      body.append(
        el(
          'tr',
          {},
          el('td', { text: product.code }),
          el('td', { text: product.name }),
          el('td', {
            className: 'is-end',
            text: formatDecimal(fromBase(product, line.unit, product.stock[from]), 3, 1),
          }),
          el('td', {}, quantity),
          el('td', {}, unit),
          el('td', {}, remove),
        ),
      );
    });
    tableBox.replaceChildren(
      lines.length === 0
        ? el('p', { className: 't-label', text: label('mutasiKosong') })
        : el(
            'div',
            { className: 'bo-table-scroll' },
            el(
              'table',
              { className: 'pos-table' },
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  el('th', { text: label('kolomKode') }),
                  el('th', { text: label('kolomNama') }),
                  el('th', { className: 'is-end', text: label('stokAsal') }),
                  el('th', { text: label('jumlahMutasi') }),
                  el('th', { text: label('kolomSatuan') }),
                  el('th', { text: '' }),
                ),
              ),
              body,
            ),
          ),
    );
  };

  const renderHistory = (): void => {
    const recent = [...session.state().transfers].reverse().slice(0, 5);
    historyBox.replaceChildren(
      el('h2', { className: 't-section-title', text: label('riwayatMutasi') }),
      recent.length === 0
        ? el('p', { className: 't-label', text: label('belumAdaMutasi') })
        : el(
            'table',
            { className: 'pos-table pos-table--dense' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', { text: label('noMutasi') }),
                el('th', { text: label('kolomWaktu') }),
                el('th', { text: label('gudangAsal') }),
                el('th', { text: label('gudangTujuan') }),
                el('th', { className: 'is-end', text: label('kolomItem') }),
              ),
            ),
            el(
              'tbody',
              {},
              ...recent.map((doc) =>
                el(
                  'tr',
                  {},
                  el('td', { text: doc.number }),
                  el('td', {
                    text: `${formatDate(new Date(doc.at))} ${formatTime(new Date(doc.at))}`,
                  }),
                  el('td', {
                    text: label(doc.from === 'besar' ? 'namaGudangBesar' : 'namaGudangDisplay'),
                  }),
                  el('td', {
                    text: label(doc.to === 'besar' ? 'namaGudangBesar' : 'namaGudangDisplay'),
                  }),
                  el('td', { className: 'is-end', text: String(doc.lines.length) }),
                ),
              ),
            ),
          ),
    );
  };

  const header = (): void => {
    dateOutput.textContent = formatDate(session.now());
    numberOutput.textContent = store.peekNumber('M');
  };

  const save = createButton({
    text: label('simpanMutasi'),
    icon: 'save',
    onClick: () => {
      if (!store.getState().online) {
        return;
      }
      const result = session.saveTransfer(from, to, lines);
      if (result.ok) {
        showToast({ kind: 'success', text: message('MSG-012', { nomor: result.number }) });
        lines = [];
        error.textContent = '';
        renderTable();
        renderHistory();
        header();
        return;
      }
      error.textContent = message(result.messageId, result.values);
      if (result.line !== undefined) {
        const target = document.querySelector<HTMLElement>(`[data-line="${String(result.line)}"]`);
        target?.setAttribute('aria-invalid', 'true');
        target?.focus();
      } else if (result.messageId === 'MSG-071') {
        toField.select.focus();
      } else {
        picker.input.focus();
      }
    },
  });
  const cancel = createButton({
    text: label('batal'),
    variant: 'secondary',
    onClick: () => {
      if (lines.length === 0) {
        error.textContent = '';
        return;
      }
      openModal({
        title: label('kosongkanFormJudul'),
        body: label('kosongkanFormTeks'),
        actions: [
          { text: label('lanjutMengisi'), variant: 'secondary' },
          {
            text: label('kosongkan'),
            variant: 'danger',
            onClick: () => {
              lines = [];
              error.textContent = '';
              renderTable();
            },
          },
        ],
      });
    },
  });

  fromField.select.addEventListener('change', () => {
    from = fromField.select.value as WarehouseId;
    error.textContent = '';
    renderTable();
  });
  toField.select.addEventListener('change', () => {
    to = toField.select.value as WarehouseId;
    error.textContent = '';
  });
  toField.select.value = to;

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      cancel.click();
    } else if (isPc() && event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save.click();
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = store.subscribe(() => {
    const online = store.getState().online;
    save.toggleAttribute('data-inactive', !online);
    save.setAttribute('aria-disabled', online ? 'false' : 'true');
  });

  const element = el(
    'div',
    { className: 'bo-transfer' },
    el(
      'section',
      { className: 'bo-panel bo-transfer__head' },
      fromField.root,
      toField.root,
      el(
        'div',
        { className: 'field' },
        el('span', { className: 'field__label', text: label('tanggal') }),
        dateOutput,
      ),
      el(
        'div',
        { className: 'field' },
        el('span', { className: 'field__label', text: label('noMutasi') }),
        numberOutput,
      ),
    ),
    picker.root,
    tableBox,
    error,
    el('div', { className: 'bo-form__actions' }, cancel, save),
    historyBox,
  );
  header();
  renderTable();
  renderHistory();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
