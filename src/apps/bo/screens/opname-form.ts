import { el, nextId } from '../../../shared/dom';
import { icon } from '../../../shared/icons';
import { formatDate, formatDecimal, formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import {
  difference,
  filledCount,
  isComplete,
  parsePhysical,
  systemStock,
  validateResult,
  type OpnameOrder,
} from '../domain/opname';
import { createProductPicker } from '../picker';
import { screenActive } from '../screen-active';
import type { ScreenHandle } from './login';
import { OPNAME_PATH, warehouseName } from './opname-shared';
import { createScrollRegion, openDocumentPreview, userName } from './mutasi/parts';
import { MUT_TEXT, mut } from './mutasi/text';

type Mode = 'perintah' | 'hasil';

// Penambahan massal lewat rak, kategori, merk, atau pemasok dibatasi supaya daftar tetap terbaca.
const BULK_LIMIT = 300;

interface FormOptions {
  readonly pso: string | undefined;
  readonly mode: Mode | undefined;
}

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

function uniqueSorted(values: readonly (string | undefined)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== undefined && value !== '')),
  ].sort((a, b) => a.localeCompare(b, 'id'));
}

function valueText(value: number): string {
  if (value === 0) {
    return formatRupiah(0);
  }
  return `${value > 0 ? '+' : '-'} ${formatRupiah(Math.abs(value))}`;
}

function diffText(value: number): string {
  if (value === 0) {
    return '0';
  }
  return `${value > 0 ? '+' : '-'} ${formatDecimal(Math.abs(value), 3, 0)}`;
}

function toneOf(value: number): string {
  if (value === 0) {
    return '';
  }
  return value > 0 ? 'is-plus' : 'is-minus';
}

// Formulir Stok Opname dua tahap (gambar klien 20): Perintah Stok Opname (PSO) menyusun barang yang
// dihitung; Hasil Stok Opname (HSO) mengisi stok fisik. Hasil lengkap menyesuaikan stok.
export function renderOpnameForm(
  session: BoSession,
  go: (path: string) => void,
  options: FormOptions,
): ScreenHandle {
  const store = session.store;
  // `pso` kosong berarti perintah baru yang masih berupa draf sesi.
  const known = options.pso !== undefined && orderOf(options.pso) !== undefined;
  let psoId: string | undefined = known ? options.pso : undefined;
  let mode: Mode =
    options.mode ?? (known && orderOf(psoId)?.hso !== undefined ? 'hasil' : 'perintah');
  // Perintah yang sedang dibuka pada mode Hasil (boleh dipilih dari daftar No PSO).
  let hasilPso: string | undefined = psoId;

  function orderOf(pso: string | undefined): OpnameOrder | undefined {
    return pso === undefined
      ? session.state().opnameDraft
      : session.state().opnameOrders.find((order) => order.pso === pso);
  }
  const current = (): OpnameOrder | undefined => {
    if (mode === 'perintah') {
      return orderOf(psoId);
    }
    return hasilPso === undefined ? undefined : orderOf(hasilPso);
  };
  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const locked = (order: OpnameOrder | undefined): boolean => order?.status === 'selesai';

  const error = el('p', { className: 'bo-error bo-mut-error', attrs: { role: 'alert' } });
  const counter = el('p', { className: 'bo-mut-counter', attrs: { 'aria-live': 'polite' } });
  const modeBar = el('div', {
    className: 'bo-opn-mode',
    attrs: { role: 'group', 'aria-label': MUT_TEXT.moduOpname },
  });
  const actions = el('div', { className: 'bo-opn-actions' });
  const head = el('section', { className: 'bo-mut-head bo-opn-head' });
  const filters = el('section', { className: 'bo-opn-filters' });
  const tableBox = el('section', { className: 'bo-mut-card bo-mut-card--lines' });

  const toast = (text: string, kind: 'success' | 'info' = 'success'): void => {
    showToast({ kind, text });
  };

  const fieldId = (): string => nextId('opn');
  const inlineField = (labelText: string, control: HTMLElement, id: string): HTMLElement =>
    el(
      'div',
      { className: 'field bo-opn-field' },
      el('label', { className: 'field__label', text: labelText, attrs: { for: id } }),
      control,
    );
  const selectField = (
    labelText: string,
    choices: readonly { readonly value: string; readonly text: string }[],
    value: string,
    disabled: boolean,
    onChange: (value: string) => void,
  ): { readonly root: HTMLElement; readonly select: HTMLSelectElement } => {
    const id = fieldId();
    const select = el(
      'select',
      { className: 'input select__control', attrs: { id } },
      ...choices.map((choice) =>
        el('option', { text: choice.text, attrs: { value: choice.value } }),
      ),
    );
    select.value = value;
    select.disabled = disabled;
    select.addEventListener('change', () => {
      onChange(select.value);
    });
    return {
      root: inlineField(
        labelText,
        el('div', { className: 'select' }, select, icon('chevron-down')),
        id,
      ),
      select,
    };
  };
  const textField = (
    labelText: string,
    type: 'text' | 'date',
    value: string,
    disabled: boolean,
    onInput: (value: string) => void,
    extra: { placeholder?: string; maxLength?: number } = {},
  ): HTMLElement => {
    const id = fieldId();
    const input = el('input', {
      className: 'input',
      attrs: {
        id,
        type,
        autocomplete: 'off',
        placeholder: extra.placeholder,
        maxlength: extra.maxLength === undefined ? undefined : String(extra.maxLength),
      },
    });
    input.value = value;
    input.disabled = disabled;
    input.addEventListener('input', () => {
      onInput(input.value);
    });
    return inlineField(labelText, input, id);
  };
  const readOnlyField = (labelText: string, value: string): HTMLElement => {
    const id = fieldId();
    const input = el('input', { className: 'input', attrs: { id, type: 'text', readonly: '' } });
    input.value = value;
    input.disabled = true;
    return inlineField(labelText, input, id);
  };

  const warehouses: readonly { readonly value: string; readonly text: string }[] = [
    { value: 'display', text: 'Toko' },
    { value: 'besar', text: 'Gudang' },
  ];

  // ---- Tabel barang ----
  const renderTable = (): void => {
    const order = current();
    const hasil = mode === 'hasil';
    const readOnly = order === undefined || locked(order) || (!hasil && order.hso !== undefined);
    if (order === undefined || order.lines.length === 0) {
      tableBox.replaceChildren(
        el('p', {
          className: 'bo-mut-empty',
          text: hasil ? MUT_TEXT.pilihPsoDulu : MUT_TEXT.daftarKosong,
        }),
      );
      counter.textContent = '';
      return;
    }
    const body = el('tbody');
    for (const line of order.lines) {
      const product = lookup(line.productId);
      if (product === undefined) {
        continue;
      }
      const system = systemStock(product, order.warehouse, line);
      const diffCell = el('td', { className: 'is-end' });
      const valueCell = el('td', { className: 'is-end' });
      const paintDiff = (raw: string): void => {
        const physical = parsePhysical(raw);
        const diff = physical === undefined ? undefined : difference(system, physical);
        diffCell.textContent = diff === undefined ? '-' : diffText(diff);
        valueCell.textContent = diff === undefined ? '-' : valueText(diff * product.hpp);
        const tone = diff === undefined ? '' : toneOf(diff);
        diffCell.className = `is-end bo-opn-diff ${tone}`;
        valueCell.className = `is-end bo-opn-diff ${tone}`;
      };
      paintDiff(line.physical);
      let physicalCell: HTMLElement;
      if (hasil && !readOnly) {
        const input = el('input', {
          className: 'input bo-mut-input bo-opn-physical',
          attrs: {
            inputmode: 'decimal',
            autocomplete: 'off',
            'aria-label': `${MUT_TEXT.kolomStokFisik} ${product.name}`,
            'data-physical': product.id,
          },
        });
        input.value = line.physical;
        input.addEventListener('input', () => {
          session.setPhysical(order.pso, product.id, input.value);
          paintDiff(input.value);
          input.removeAttribute('aria-invalid');
          error.textContent = '';
          updateCounter();
        });
        physicalCell = input;
      } else {
        physicalCell = el('span', { text: line.physical === '' ? '-' : line.physical });
      }
      const remove =
        !hasil && !readOnly
          ? createButton({
              text: MUT_TEXT.hapusBaris,
              variant: 'secondary',
              icon: 'trash-2',
              onClick: () => {
                session.removeOpnameLine(psoId, product.id);
                renderTable();
              },
            })
          : undefined;
      remove?.setAttribute('aria-label', `${MUT_TEXT.hapusBaris} ${product.name}`);
      body.append(
        el(
          'tr',
          {},
          el('td', { text: product.code }),
          el('td', { text: product.name }),
          el('td', { text: product.baseUnit }),
          el('td', { className: 'is-end', text: formatDecimal(system, 3, 0) }),
          el('td', { className: 'is-end' }, physicalCell),
          diffCell,
          valueCell,
          ...(hasil ? [] : [el('td', { className: 'is-action' }, remove)]),
        ),
      );
    }
    tableBox.replaceChildren(
      createScrollRegion(
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
              el('th', { text: MUT_TEXT.kolomKode }),
              el('th', { text: MUT_TEXT.kolomNamaBarang }),
              el('th', { text: MUT_TEXT.kolomSatuan }),
              el('th', { className: 'is-end', text: MUT_TEXT.kolomStokSistem }),
              el('th', { className: 'is-end', text: MUT_TEXT.kolomStokFisik }),
              el('th', { className: 'is-end', text: MUT_TEXT.kolomSelisih }),
              el('th', { className: 'is-end', text: MUT_TEXT.kolomNilai }),
              ...(hasil
                ? []
                : [
                    el(
                      'th',
                      {},
                      el('span', { className: 'visually-hidden', text: MUT_TEXT.hapusBaris }),
                    ),
                  ]),
            ),
          ),
          body,
        ),
      ),
    );
    updateCounter();
  };

  const updateCounter = (): void => {
    const order = current();
    counter.textContent =
      order === undefined || mode !== 'hasil'
        ? ''
        : mut('terisi', {
            terisi: formatDecimal(filledCount(order)),
            total: formatDecimal(order.lines.length),
          });
  };

  // ---- Kepala dan penyaring ----
  const renderHead = (): void => {
    const order = current();
    const disabled = locked(order);
    if (mode === 'perintah') {
      const draft = order;
      const counting = draft?.hso !== undefined;
      const users = store.getState().data.users.filter((user) => user.active);
      head.replaceChildren(
        textField(
          MUT_TEXT.kolomTanggal,
          'date',
          draft?.date ?? '',
          disabled || counting,
          (value) => {
            session.editOpname(psoId, { date: value });
          },
        ),
        readOnlyField(MUT_TEXT.noPso, psoId === undefined ? MUT_TEXT.otomatis : (draft?.pso ?? '')),
        selectField(
          MUT_TEXT.petugas,
          users.map((user) => ({ value: user.id, text: user.name })),
          draft?.officerId ?? '',
          disabled || counting,
          (value) => {
            session.editOpname(psoId, { officerId: value });
          },
        ).root,
        selectField(
          MUT_TEXT.kolomGudang,
          warehouses,
          draft?.warehouse ?? 'display',
          disabled || counting,
          (value) => {
            session.editOpname(psoId, { warehouse: value as WarehouseId });
            renderTable();
          },
        ).root,
        textField(
          MUT_TEXT.kolomKeterangan,
          'text',
          draft?.note ?? '',
          disabled,
          (value) => {
            session.editOpname(psoId, { note: value });
          },
          { maxLength: 120 },
        ),
      );
      head.classList.remove('bo-opn-head--hasil');
      return;
    }
    const open = session
      .state()
      .opnameOrders.filter((item) => item.status !== 'selesai' || item.pso === hasilPso);
    const choices = [
      { value: '', text: MUT_TEXT.pilihPso },
      ...open.map((item) => ({ value: item.pso, text: item.pso })),
    ];
    head.replaceChildren(
      textField(
        MUT_TEXT.kolomTanggal,
        'date',
        order?.resultDate ?? order?.date ?? '',
        disabled || order === undefined,
        (value) => {
          if (hasilPso !== undefined) {
            session.editOpname(hasilPso, { resultDate: value });
          }
        },
      ),
      readOnlyField(MUT_TEXT.noHso, order?.hso ?? MUT_TEXT.otomatis),
      selectField(MUT_TEXT.noPso, choices, hasilPso ?? '', false, (value) => {
        hasilPso = value === '' ? undefined : value;
        error.textContent = '';
        renderAll();
      }).root,
      textField(
        MUT_TEXT.kolomKeterangan,
        'text',
        order?.note ?? '',
        disabled || order === undefined,
        (value) => {
          if (hasilPso !== undefined) {
            session.editOpname(hasilPso, { note: value });
          }
        },
        { maxLength: 120 },
      ),
    );
    head.classList.add('bo-opn-head--hasil');
  };

  const products = (): readonly Product[] => store.getState().data.products;
  const filterSelects: HTMLSelectElement[] = [];
  const renderFilters = (): void => {
    const order = current();
    filterSelects.length = 0;
    if (mode !== 'perintah' || order === undefined || order.hso !== undefined || locked(order)) {
      filters.hidden = true;
      filters.replaceChildren();
      return;
    }
    filters.hidden = false;
    const all = products().filter((product) => product.active !== false);
    const options = (values: readonly string[]): { value: string; text: string }[] => [
      { value: '', text: MUT_TEXT.semua },
      ...values.map((value) => ({ value, text: value })),
    ];
    const rack = selectField(
      MUT_TEXT.noRak,
      options(uniqueSorted(all.map((p) => p.rak))),
      '',
      false,
      () => {
        applyFilters();
      },
    );
    const category = selectField(
      MUT_TEXT.kategoriBarang,
      options(uniqueSorted(all.map((p) => p.category))),
      '',
      false,
      () => {
        applyFilters();
      },
    );
    const brand = selectField(
      MUT_TEXT.merkBarang,
      options(uniqueSorted(all.map((p) => p.brand))),
      '',
      false,
      () => {
        applyFilters();
      },
    );
    const supplier = selectField(
      MUT_TEXT.pemasok,
      options(uniqueSorted(all.map((p) => p.supplierName))),
      '',
      false,
      () => {
        applyFilters();
      },
    );
    filterSelects.push(rack.select, category.select, brand.select, supplier.select);
    const picker = createProductPicker({
      labelText: MUT_TEXT.namaBarang,
      products: () => products().filter((product) => product.active !== false),
      onPick: (product) => {
        session.addOpnameProducts(psoId, [product]);
        error.textContent = '';
        renderTable();
      },
    });
    picker.root.classList.add('bo-opn-picker');
    filters.replaceChildren(picker.root, rack.root, category.root, brand.root, supplier.root);

    function applyFilters(): void {
      const [rackValue = '', categoryValue = '', brandValue = '', supplierValue = ''] =
        filterSelects.map((select) => select.value);
      const matches = all.filter(
        (product) =>
          (rackValue === '' || product.rak === rackValue) &&
          (categoryValue === '' || product.category === categoryValue) &&
          (brandValue === '' || product.brand === brandValue) &&
          (supplierValue === '' || product.supplierName === supplierValue),
      );
      for (const select of filterSelects) {
        select.value = '';
      }
      if (matches.length === 0) {
        toast(MUT_TEXT.barangTidakAda, 'info');
        return;
      }
      if (matches.length > BULK_LIMIT) {
        toast(
          mut('barangTerlaluBanyak', {
            jumlah: formatDecimal(matches.length),
            batas: formatDecimal(BULK_LIMIT),
          }),
          'info',
        );
        return;
      }
      const added = session.addOpnameProducts(psoId, matches);
      error.textContent = '';
      toast(mut('barangDitambah', { jumlah: formatDecimal(added) }), 'info');
      renderTable();
    }
  };

  // ---- Tombol aksi ----
  const showFailure = (result: ReturnType<BoSession['saveOpnameResult']>): void => {
    if (result.ok) {
      return;
    }
    if ('empty' in result) {
      error.textContent = MUT_TEXT.tambahBarangDulu;
      return;
    }
    error.textContent = message(result.messageId, result.values);
    if (result.productId !== undefined) {
      const target = document.querySelector<HTMLElement>(`[data-physical="${result.productId}"]`);
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
    }
  };

  const savePerintah = (): void => {
    if (!store.getState().online) {
      return;
    }
    const result = session.saveOpnameOrder(psoId);
    if (!result.ok) {
      showFailure(result);
      return;
    }
    error.textContent = '';
    toast(mut('psoTersimpan', { nomor: result.pso }));
    go(OPNAME_PATH);
  };

  const proses = (): void => {
    if (!store.getState().online) {
      return;
    }
    const saved = session.saveOpnameOrder(psoId);
    if (!saved.ok) {
      showFailure(saved);
      return;
    }
    const started = session.startOpnameCount(saved.pso);
    if (!started.ok) {
      showFailure(started);
      return;
    }
    psoId = saved.pso;
    hasilPso = saved.pso;
    mode = 'hasil';
    error.textContent = '';
    toast(mut('hitungMulai', { nomor: orderOf(saved.pso)?.hso ?? saved.pso }), 'info');
    renderAll();
  };

  const simpanHasil = (): void => {
    if (!store.getState().online) {
      return;
    }
    const order = hasilPso === undefined ? undefined : orderOf(hasilPso);
    if (order === undefined || hasilPso === undefined) {
      error.textContent = MUT_TEXT.pilihPsoDulu;
      return;
    }
    if (locked(order)) {
      error.textContent = MUT_TEXT.selesaiTerkunci;
      return;
    }
    const target = hasilPso;
    const commit = (): void => {
      const result = session.saveOpnameResult(target);
      if (!result.ok) {
        showFailure(result);
        return;
      }
      error.textContent = '';
      const number = orderOf(target)?.hso ?? target;
      toast(
        result.status === 'selesai'
          ? mut('opnameSelesai', { nomor: number })
          : mut('hasilTersimpan', { nomor: number }),
      );
      go(OPNAME_PATH);
    };
    // Isian tidak valid ditolak lebih dulu, sebelum kotak konfirmasi penyelesaian muncul.
    const issue = validateResult(order, false);
    if (issue !== undefined) {
      showFailure({
        ok: false,
        messageId: issue.messageId,
        values: {},
        productId: issue.productId,
      });
      return;
    }
    if (isComplete(order)) {
      openModal({
        title: label('terapkanJudul'),
        body: label('terapkanTeks', { jumlah: String(order.lines.length) }),
        actions: [
          { text: label('batal'), variant: 'secondary' },
          { text: label('terapkan'), variant: 'primary', onClick: commit },
        ],
      });
      return;
    }
    commit();
  };

  const cetak = (): void => {
    const order = current();
    if (order === undefined || order.lines.length === 0) {
      return;
    }
    const hasil = mode === 'hasil';
    openDocumentPreview({
      modalTitle: hasil ? MUT_TEXT.hasilOpname : MUT_TEXT.perintahOpname,
      heading: hasil ? MUT_TEXT.hasilOpname : MUT_TEXT.perintahOpname,
      number: hasil ? (order.hso ?? MUT_TEXT.otomatis) : order.pso,
      intro: mut('psoGudang', {
        gudang: warehouseName(order),
        petugas: userName(store, order.officerId),
        tanggal: formatDate(new Date(`${order.date}T12:00:00+07:00`)),
      }),
      columns: [
        { text: 'No' },
        { text: MUT_TEXT.kolomKode },
        { text: MUT_TEXT.kolomNamaBarang },
        { text: MUT_TEXT.kolomSatuan },
        { text: MUT_TEXT.kolomStokSistem, end: true },
        { text: MUT_TEXT.kolomStokFisik, end: true },
        { text: MUT_TEXT.kolomSelisih, end: true },
      ],
      rows: order.lines.flatMap((line, index) => {
        const product = lookup(line.productId);
        if (product === undefined) {
          return [];
        }
        const system = systemStock(product, order.warehouse, line);
        const physical = parsePhysical(line.physical);
        return [
          [
            String(index + 1),
            product.code,
            product.name,
            product.baseUnit,
            formatDecimal(system, 3, 0),
            physical === undefined || !hasil ? '' : formatDecimal(physical, 3, 0),
            physical === undefined || !hasil ? '' : diffText(difference(system, physical)),
          ],
        ];
      }),
      note:
        hasil && order.status === 'selesai'
          ? mut('jurnalSelisih', { nilai: formatRupiah(order.journalValue) })
          : MUT_TEXT.catatanCetakPso,
      signs: [
        { role: MUT_TEXT.dibuatOleh, name: userName(store, order.officerId) },
        { role: MUT_TEXT.disetujuiOleh, name: '' },
        { role: MUT_TEXT.petugasTtd, name: '' },
      ],
      onPrint: () => {
        window.print();
      },
    });
  };

  const renderActions = (): void => {
    const order = current();
    const disabled = locked(order);
    const back = createButton({
      text: MUT_TEXT.kembaliKeDaftar,
      variant: 'secondary',
      icon: 'arrow-left',
      onClick: () => {
        go(OPNAME_PATH);
      },
    });
    const print = createButton({
      text: MUT_TEXT.cetak,
      variant: 'secondary',
      icon: 'printer',
      onClick: cetak,
    });
    const save = createButton({
      text: MUT_TEXT.simpan,
      variant: 'secondary',
      icon: 'save',
      onClick: mode === 'perintah' ? savePerintah : simpanHasil,
    });
    save.toggleAttribute(
      'data-inactive',
      disabled || (mode === 'perintah' && order?.hso !== undefined),
    );
    if (disabled || (mode === 'perintah' && order?.hso !== undefined)) {
      save.disabled = true;
    }
    const buttons: HTMLElement[] = [counter, save];
    if (mode === 'perintah') {
      const process = createButton({ text: MUT_TEXT.prosesOpname, onClick: proses });
      process.classList.add('bo-opn-process');
      if (disabled || order?.hso !== undefined) {
        process.disabled = true;
      }
      buttons.push(process);
    }
    buttons.push(print, back);
    actions.replaceChildren(...buttons);
  };

  const modeButton = (target: Mode, text: string): HTMLButtonElement => {
    const button = createButton({
      text,
      variant: mode === target ? 'primary' : 'secondary',
      onClick: () => {
        if (mode === target) {
          return;
        }
        mode = target;
        if (target === 'hasil') {
          hasilPso = psoId ?? hasilPso;
        }
        error.textContent = '';
        renderAll();
      },
    });
    button.setAttribute('aria-pressed', mode === target ? 'true' : 'false');
    return button;
  };

  const renderAll = (): void => {
    modeBar.replaceChildren(
      modeButton('perintah', MUT_TEXT.perintahOpname),
      modeButton('hasil', MUT_TEXT.hasilOpname),
    );
    renderHead();
    renderFilters();
    renderTable();
    renderActions();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(element)) {
      return;
    }
    if (document.querySelector('.modal-overlay') !== null || !isPc()) {
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (mode === 'perintah') {
        savePerintah();
      } else {
        simpanHasil();
      }
    }
  };
  document.addEventListener('keydown', onKey);

  const element = el(
    'div',
    { className: 'bo-mut bo-mut--form bo-opn' },
    el('div', { className: 'bo-opn-bar' }, modeBar, actions),
    head,
    filters,
    error,
    tableBox,
  );
  renderAll();
  return {
    element,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
    },
  };
}
