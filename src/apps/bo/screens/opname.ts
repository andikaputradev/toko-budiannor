import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { createSelectField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import { difference, filledCount, parsePhysical, systemStock } from '../domain/opname';
import { createProductPicker } from '../picker';
import type { ScreenHandle } from './login';
import { screenActive } from '../screen-active';

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function renderOpname(session: BoSession): ScreenHandle {
  const store = session.store;
  const warehouse = createSelectField({
    labelText: label('gudang'),
    options: [
      { value: 'display', text: label('namaGudangDisplay') },
      { value: 'besar', text: label('namaGudangBesar') },
    ],
    value: session.state().opname.warehouse,
  });
  const statusOutput = el('output', { className: 't-value' });
  const numberOutput = el('output', { className: 't-value' });
  const dateOutput = el('output', { className: 't-value' });
  const counter = el('p', { className: 't-label', attrs: { 'aria-live': 'polite' } });
  const journal = el('p', { className: 't-label' });
  const error = el('p', { className: 'bo-error', attrs: { role: 'alert' } });
  const tableBox = el('div', { className: 'bo-panel bo-opname-table' });
  const actions = el('div', { className: 'bo-form__actions' });

  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const applied = (): boolean => session.state().opname.status === 'diterapkan';

  const picker = createProductPicker({
    labelText: label('cariAtauPindai'),
    products: () => store.getState().data.products,
    onPick: (product) => {
      const result = session.addOpnameProduct(product);
      if (!result.ok) {
        error.textContent = message(result.messageId);
        return;
      }
      error.textContent = '';
      render();
      document.querySelector<HTMLElement>(`[data-physical="${product.id}"]`)?.focus();
    },
  });
  picker.root.classList.add('bo-picker--narrow');

  const diffText = (product: Product, physical: string, snapshot: number | undefined): string => {
    const value = parsePhysical(physical);
    if (value === undefined) {
      return '-';
    }
    const system = snapshot ?? product.stock[session.state().opname.warehouse];
    return formatDecimal(difference(system, value), 3, 1);
  };

  const updateCounter = (): void => {
    const doc = session.state().opname;
    counter.textContent = label('terisiDari', {
      terisi: formatDecimal(filledCount(doc)),
      total: formatDecimal(doc.lines.length),
    });
  };

  const render = (): void => {
    const doc = session.state().opname;
    const readOnly = doc.status === 'diterapkan';
    statusOutput.textContent = label(readOnly ? 'statusDiterapkan' : 'statusDraf');
    numberOutput.textContent = doc.number;
    dateOutput.textContent = formatDate(new Date(`${doc.date}T12:00:00+07:00`));
    warehouse.select.disabled = readOnly;
    warehouse.select.value = doc.warehouse;
    journal.textContent = readOnly
      ? label('jurnalSelisih', { nilai: formatRupiah(doc.journalValue) })
      : '';
    const body = el('tbody');
    for (const line of doc.lines) {
      const product = lookup(line.productId);
      if (product === undefined) {
        continue;
      }
      const diff = el('td', {
        className: 'is-end',
        text: diffText(product, line.physical, line.systemSnapshot),
      });
      const physical = readOnly
        ? el('span', { text: line.physical })
        : el('input', {
            className: 'input bo-cell-input',
            attrs: {
              inputmode: 'decimal',
              autocomplete: 'off',
              'aria-label': `${label('stokFisik')} ${product.name}`,
              'data-physical': product.id,
            },
          });
      if (physical instanceof HTMLInputElement) {
        physical.value = line.physical;
        physical.addEventListener('input', () => {
          session.setPhysical(product.id, physical.value);
          diff.textContent = diffText(product, physical.value, undefined);
          physical.removeAttribute('aria-invalid');
          error.textContent = '';
          updateCounter();
        });
      }
      const note = readOnly
        ? el('span', { text: line.note })
        : el('input', {
            className: 'input bo-cell-input',
            attrs: { autocomplete: 'off', 'aria-label': `${label('catatan')} ${product.name}` },
          });
      if (note instanceof HTMLInputElement) {
        note.value = line.note;
        note.addEventListener('input', () => {
          session.setNote(product.id, note.value);
        });
      }
      const remove = createButton({
        text: label('hapus'),
        variant: 'secondary',
        onClick: () => {
          session.removeOpnameLine(product.id);
          render();
        },
      });
      remove.setAttribute('aria-label', `${label('hapus')} ${product.name}`);
      if (readOnly) {
        remove.setAttribute('hidden', '');
      }
      body.append(
        el(
          'tr',
          {},
          el('td', { text: product.code }),
          el('td', { text: product.name }),
          el('td', {
            className: 'is-end',
            text: formatDecimal(systemStock(product, doc.warehouse, line), 3, 1),
          }),
          el('td', {}, physical),
          diff,
          el('td', {}, note),
          el('td', {}, remove),
        ),
      );
    }
    tableBox.replaceChildren(
      doc.lines.length === 0
        ? el('p', { className: 't-label', text: label('opnameKosong') })
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
                  el('th', { text: label('kolomNamaBarang') }),
                  el('th', { className: 'is-end', text: label('stokSistem') }),
                  el('th', { text: label('stokFisik') }),
                  el('th', { className: 'is-end', text: label('selisih') }),
                  el('th', { text: label('catatan') }),
                  el('th', { text: '' }),
                ),
              ),
              body,
            ),
          ),
    );
    updateCounter();
    renderActions();
  };

  const show = (result: {
    ok: false;
    messageId: Parameters<typeof message>[0];
    productId?: string | undefined;
  }): void => {
    error.textContent = message(result.messageId);
    if (result.productId !== undefined) {
      const target = document.querySelector<HTMLElement>(`[data-physical="${result.productId}"]`);
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
    }
  };

  const saveDraft = (): void => {
    if (!store.getState().online) {
      return;
    }
    const result = session.saveOpnameDraft();
    if (result.ok) {
      error.textContent = '';
      showToast({ kind: 'success', text: label('draftOpnameTersimpan') });
    } else {
      show(result);
    }
  };
  const apply = (): void => {
    if (!store.getState().online) {
      return;
    }
    const doc = session.state().opname;
    if (doc.status === 'diterapkan') {
      error.textContent = message('MSG-077');
      return;
    }
    openModal({
      title: label('terapkanJudul'),
      body: label('terapkanTeks', { jumlah: String(doc.lines.length) }),
      actions: [
        { text: label('batal'), variant: 'secondary' },
        {
          text: label('terapkan'),
          variant: 'primary',
          onClick: () => {
            const result = session.applyOpname();
            if (result.ok) {
              error.textContent = '';
              showToast({ kind: 'success', text: label('opnameDiterapkan') });
              render();
            } else {
              show(result);
            }
          },
        },
      ],
    });
  };

  const renderActions = (): void => {
    const readOnly = applied();
    const save = createButton({
      text: label('simpanDrafOpname'),
      variant: 'secondary',
      icon: 'save',
      onClick: saveDraft,
    });
    const submit = createButton({ text: label('terapkanPenyesuaian'), onClick: apply });
    for (const button of [save, submit]) {
      button.toggleAttribute('data-inactive', readOnly);
    }
    actions.replaceChildren(
      ...(readOnly
        ? [
            save,
            submit,
            createButton({
              text: label('opnameBaru'),
              onClick: () => {
                session.newOpname();
                error.textContent = '';
                render();
              },
            }),
          ]
        : [save, submit]),
    );
  };

  warehouse.select.addEventListener('change', () => {
    session.setOpnameWarehouse(warehouse.select.value as WarehouseId);
    render();
  });
  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(element)) {
      return;
    }
    if (document.querySelector('.modal-overlay') !== null || !isPc()) {
      return;
    }
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      apply();
    } else if (event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveDraft();
    }
  };
  document.addEventListener('keydown', onKey);

  const element = el(
    'div',
    { className: 'bo-opname' },
    el(
      'section',
      { className: 'bo-panel bo-transfer__head' },
      warehouse.root,
      el(
        'div',
        { className: 'field' },
        el('span', { className: 'field__label', text: label('tanggal') }),
        dateOutput,
      ),
      el(
        'div',
        { className: 'field' },
        el('span', { className: 'field__label', text: label('kolomStatus') }),
        statusOutput,
      ),
      el(
        'div',
        { className: 'field' },
        el('span', { className: 'field__label', text: label('noOpname') }),
        numberOutput,
      ),
    ),
    picker.root,
    counter,
    tableBox,
    journal,
    error,
    actions,
  );
  render();
  return {
    element,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
    },
  };
}
