import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { createSelectField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import {
  difference,
  filledCount,
  parsePhysical,
  systemStock,
  type OpnameDoc,
} from '../domain/opname';
import { createProductPicker } from '../picker';
import type { ScreenHandle } from './login';
import { screenActive } from '../screen-active';
import {
  createCreateBar,
  createListCard,
  createScrollRegion,
  openDocumentPreview,
  userName,
} from './mutasi/parts';
import { MUT_TEXT, mut } from './mutasi/text';

const LIST_PATH = '/bo/opname';
const FORM_PATH = '/bo/opname?baru=1';

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

function docDate(doc: OpnameDoc): string {
  return formatDate(new Date(`${doc.date}T12:00:00+07:00`));
}

// Stok Opname: Daftar Perintah Stok Opname (judul klien tanpa gambar; susunannya mengikuti daftar
// Transfer dan Koreksi) dan, lewat "+ Perintah Opname", formulir opname pada tab yang sama.
export function renderOpname(
  session: BoSession,
  go: (path: string) => void,
  creating = false,
): ScreenHandle {
  return creating ? renderOpnameForm(session, go) : renderOpnameList(session, go);
}

function renderOpnameList(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const body = el('tbody');
  const emptyBox = el('p', { className: 'bo-mut-empty', text: MUT_TEXT.opnameKosong });
  const table = el(
    'table',
    { className: 'bo-mut-table bo-mut-table--log' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: MUT_TEXT.kolomNoOpname }),
        el('th', { text: MUT_TEXT.kolomTanggal }),
        el('th', { text: MUT_TEXT.kolomGudang }),
        el('th', { text: MUT_TEXT.kolomPetugas }),
        el('th', { className: 'is-end', text: MUT_TEXT.kolomBarang }),
        el('th', { text: MUT_TEXT.kolomStatus }),
        el('th', { className: 'is-end', text: MUT_TEXT.kolomNilaiSelisih }),
        el(
          'th',
          { className: 'is-action' },
          el('span', { className: 'visually-hidden', text: MUT_TEXT.aksi }),
        ),
      ),
    ),
    body,
  );
  const region = createScrollRegion(MUT_TEXT.daftarOpname, table);
  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);

  const preview = (doc: OpnameDoc): void => {
    openDocumentPreview({
      modalTitle: MUT_TEXT.daftarPerintahOpname,
      heading: label('menuStokOpname'),
      number: doc.number,
      intro: `${label('gudang')}: ${label(doc.warehouse === 'besar' ? 'namaGudangBesar' : 'namaGudangDisplay')}. ${MUT_TEXT.kolomTanggal}: ${docDate(doc)}.`,
      columns: [
        { text: 'No' },
        { text: label('kolomKode') },
        { text: label('kolomNamaBarang') },
        { text: label('stokSistem'), end: true },
        { text: label('stokFisik'), end: true },
        { text: label('selisih'), end: true },
      ],
      rows: doc.lines.flatMap((line, index) => {
        const product = lookup(line.productId);
        const physical = parsePhysical(line.physical);
        if (product === undefined || physical === undefined) {
          return [];
        }
        const system = systemStock(product, doc.warehouse, line);
        return [
          [
            String(index + 1),
            product.code,
            product.name,
            formatDecimal(system, 3, 1),
            formatDecimal(physical, 3, 1),
            formatDecimal(difference(system, physical), 3, 1),
          ],
        ];
      }),
      note: label('jurnalSelisih', { nilai: formatRupiah(doc.journalValue) }),
      signs: [
        { role: MUT_TEXT.dibuatOleh, name: userName(store, doc.appliedBy) },
        { role: MUT_TEXT.disetujuiOleh, name: '' },
        { role: MUT_TEXT.diterimaOleh, name: '' },
      ],
      onPrint: () => {
        window.print();
      },
    });
  };

  const row = (doc: OpnameDoc, current: boolean): HTMLElement => {
    const action = createButton({
      text: current ? MUT_TEXT.lanjutkanDraf : MUT_TEXT.lihat,
      variant: 'secondary',
      onClick: () => {
        if (current) {
          go(FORM_PATH);
        } else {
          preview(doc);
        }
      },
    });
    action.setAttribute('aria-label', `${action.textContent} ${doc.number}`);
    return el(
      'tr',
      { className: current ? 'is-selected' : '' },
      el('td', {}, el('strong', { text: doc.number })),
      el('td', { text: docDate(doc) }),
      el('td', {
        text: label(doc.warehouse === 'besar' ? 'namaGudangBesar' : 'namaGudangDisplay'),
      }),
      el('td', {
        text: current
          ? (session.state().user?.name ?? userName(store, store.getState().userId))
          : userName(store, doc.appliedBy),
      }),
      el('td', {
        className: 'is-end',
        text: mut('barangJumlah', { jumlah: formatDecimal(doc.lines.length) }),
      }),
      el(
        'td',
        {},
        el('span', {
          className: `bo-mut-pill ${current ? 'bo-mut-pill--draft' : 'bo-mut-pill--ok'}`,
          text: current ? MUT_TEXT.statusDraf : MUT_TEXT.statusDiterapkan,
        }),
      ),
      el('td', { className: 'is-end', text: current ? '-' : formatRupiah(doc.journalValue) }),
      el('td', { className: 'is-action' }, action),
    );
  };

  const paint = (): void => {
    const state = session.state();
    const draft =
      state.opname.status === 'draf' && state.opname.lines.length > 0 ? [state.opname] : [];
    const past = [...state.opnameHistory].reverse();
    body.replaceChildren(
      ...draft.map((doc) => row(doc, true)),
      ...past.map((doc) => row(doc, false)),
    );
    const none = draft.length + past.length === 0;
    emptyBox.hidden = !none;
    table.hidden = none;
  };
  paint();
  const stop = session.subscribe(paint);

  const element = el(
    'div',
    { className: 'bo-mut' },
    createCreateBar(MUT_TEXT.perintahOpname, () => {
      go(FORM_PATH);
    }),
    createListCard({
      title: MUT_TEXT.daftarPerintahOpname,
      content: el('div', { className: 'bo-mut-card__body' }, region, emptyBox),
    }),
  );
  return { element, destroy: stop };
}

function renderOpnameForm(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const warehouse = createSelectField({
    labelText: label('gudang'),
    options: [
      { value: 'display', text: label('namaGudangDisplay') },
      { value: 'besar', text: label('namaGudangBesar') },
    ],
    value: session.state().opname.warehouse,
  });
  const statusOutput = el('output', { className: 'bo-mut-fact__value' });
  const numberOutput = el('output', { className: 'bo-mut-fact__value' });
  const dateOutput = el('output', { className: 'bo-mut-fact__value' });
  const counter = el('p', {
    className: 'bo-mut-counter',
    attrs: { 'aria-live': 'polite' },
  });
  const journal = el('p', { className: 'bo-mut-journal' });
  const error = el('p', { className: 'bo-error bo-mut-error', attrs: { role: 'alert' } });
  const tableBox = el('section', { className: 'bo-mut-card bo-mut-card--lines' });
  const actions = el('div', { className: 'bo-mut-toolbar__actions' });

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
  picker.root.classList.add('bo-mut-picker');

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
            className: 'input bo-mut-input',
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
            className: 'input bo-mut-input bo-mut-text',
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
          el('td', { className: 'is-action' }, remove),
        ),
      );
    }
    tableBox.replaceChildren(
      doc.lines.length === 0
        ? el('p', { className: 'bo-mut-empty', text: label('opnameKosong') })
        : createScrollRegion(
            MUT_TEXT.daftarOpname,
            el(
              'table',
              { className: 'bo-mut-table bo-mut-table--lines' },
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
                  el('th', {}, el('span', { className: 'visually-hidden', text: label('hapus') })),
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
    const back = createButton({
      text: MUT_TEXT.kembaliKeDaftar,
      variant: 'secondary',
      icon: 'arrow-left',
      onClick: () => {
        go(LIST_PATH);
      },
    });
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
            back,
          ]
        : [save, submit, back]),
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

  const fact = (text: string, output: HTMLElement): HTMLElement =>
    el(
      'div',
      { className: 'bo-mut-fact' },
      el('span', { className: 'bo-mut-fact__label', text }),
      output,
    );
  const element = el(
    'div',
    { className: 'bo-mut bo-mut--form' },
    el(
      'section',
      { className: 'bo-mut-head' },
      fact(label('tanggal'), dateOutput),
      fact(label('noOpname'), numberOutput),
      fact(label('kolomStatus'), statusOutput),
      warehouse.root,
    ),
    el(
      'div',
      { className: 'bo-mut-toolbar' },
      el('div', { className: 'bo-mut-toolbar__tools' }, picker.root, counter),
      actions,
    ),
    error,
    journal,
    tableBox,
  );
  render();
  return {
    element,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
    },
  };
}
