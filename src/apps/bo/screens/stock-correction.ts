import { el, nextId } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { matchesPhrase } from '../../../shared/data/search-index';
import { wibDate } from '../../../shared/data/receivable';
import { icon } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { fromBase } from '../../../shared/data/units';
import { INITIAL_GUARD, type PinGuard } from '../../../shared/domain/pin';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createSelectField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { BO_DEVICE, BO_IP, type BoSession } from '../bo-session';
import { DEFAULT_STORE_PROFILE } from '../domain/settings-rbac';
import {
  buildDoc,
  checkOwnerPin,
  combineReasons,
  evaluateLine,
  ledgerFor,
  needsOwnerPin,
  OWNER_PIN_LIMIT,
  planCorrection,
  stockAfter,
  type CorrectionDoc,
  type CorrectionDraftLine,
  type CorrectionIssue,
  type CorrectionPlan,
} from '../domain/stock-correction';
import { formatSigned, formatSignedRupiah } from '../domain/stock-report';
import { createProductPicker } from '../picker';
import type { ScreenHandle } from './login';
import { screenActive } from '../screen-active';
import { dateRangeFor, type DateRangeKind } from '../domain/transaction-list';
import { createScrollRegion } from './mutasi/parts';
import {
  createDateFilter,
  createListPage,
  createRefreshButton,
  createRowSelection,
  createSearchBox,
  refuseDelete,
} from './trx/list-page';
import { MUT_TEXT } from './mutasi/text';

const LIST_PATH = '/bo/mutasi/koreksi';
const FORM_PATH = '/bo/mutasi/koreksi?baru=1';

const WAREHOUSE_OPTIONS: readonly { readonly value: WarehouseId; readonly key: LabelKey }[] = [
  { value: 'display', key: 'namaGudangDisplay' },
  { value: 'besar', key: 'namaGudangBesar' },
];

const REASON_PRESETS: readonly LabelKey[] = [
  'korAlasanRusak',
  'korAlasanHilang',
  'korAlasanSalahHitung',
  'korAlasanSalahInput',
  'korAlasanDitemukan',
];

// Nomor dokumen yang baru disimpan pada sesi ini: barisnya diberi warna sorot di daftar.
let justSaved: string | undefined;

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

function warehouseName(warehouse: WarehouseId): string {
  return label(warehouse === 'besar' ? 'namaGudangBesar' : 'namaGudangDisplay');
}

function stamp(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(date)} ${formatTime(date)}`;
}

function toneOf(value: number): string {
  if (value > 0) {
    return 'bo-korek-diff bo-korek-diff--plus';
  }
  return value < 0 ? 'bo-korek-diff bo-korek-diff--minus' : 'bo-korek-diff';
}

function issueText(issue: CorrectionIssue): string {
  return 'messageId' in issue ? message(issue.messageId) : label(issue.labelKey);
}

function actorOf(session: BoSession): { readonly id: string; readonly name: string } {
  const state = session.store.getState();
  const user = session.state().user ?? state.data.users.find((item) => item.id === state.userId);
  return { id: user?.id ?? state.userId, name: user?.name ?? state.userId };
}

function logActivity(session: BoSession, kind: 'koreksi' | 'cetak', detail: string): void {
  session.store.logActivity({
    at: session.now().toISOString(),
    userId: actorOf(session).id,
    device: BO_DEVICE,
    ip: BO_IP,
    kind,
    detail,
  });
}

// Berita Acara Koreksi Stok: dipakai tombol "Cetak Berita Acara" di daftar dan Cetak di formulir.
function openReport(session: BoSession, doc: CorrectionDoc, draft: boolean): void {
  const profile = DEFAULT_STORE_PROFILE;
  const rows = doc.lines.map((line, index) =>
    el(
      'tr',
      {},
      el('td', { text: String(index + 1) }),
      el(
        'td',
        {},
        el('span', { className: 'bo-korek__name', text: line.name }),
        el('span', { className: 'bo-korek__code', text: line.code }),
      ),
      el('td', { text: warehouseName(line.warehouse) }),
      el('td', {
        className: 'is-end',
        text: `${formatDecimal(line.systemQty, 3, 1)} ${line.unit}`,
      }),
      el('td', {
        className: 'is-end',
        text: `${formatDecimal(line.actualQty, 3, 1)} ${line.unit}`,
      }),
      el('td', {
        className: 'is-end',
        text: `${formatSigned(line.diffQty, 3, 1)} ${line.unit}`,
      }),
      el('td', { className: 'is-end', text: formatSignedRupiah(line.value) }),
      el('td', { text: line.reason }),
    ),
  );
  const signature = (role: string, name: string): HTMLElement =>
    el(
      'div',
      { className: 'bo-korek-ba__sign' },
      el('span', { className: 'bo-korek-ba__sign-role', text: role }),
      el('span', { className: 'bo-korek-ba__sign-line' }),
      el('span', { className: 'bo-korek-ba__sign-name', text: name }),
    );
  const body = el(
    'div',
    { className: 'bo-print-modal-content bo-korek-ba' },
    el(
      'div',
      { className: 'bo-korek-ba__head' },
      el('p', { className: 'bo-korek-ba__store', text: profile.name }),
      el('p', {
        className: 'bo-korek-ba__address',
        text: `${profile.tagline}. ${profile.address}`,
      }),
      el('h3', { className: 'bo-korek-ba__title', text: label('korBaJudul') }),
      el('p', { className: 'bo-korek-ba__number', text: doc.number }),
    ),
    el('p', { text: label('korBaPembuka', { tanggal: stamp(doc.at) }) }),
    el(
      'div',
      { className: 'bo-stok-scroll' },
      el(
        'table',
        { className: 'pos-table bo-stok-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'No' }),
            el('th', { text: label('kolomNamaBarang') }),
            el('th', { text: label('kolomGudang') }),
            el('th', { className: 'is-end', text: label('stokSistem') }),
            el('th', { className: 'is-end', text: label('korKolomStokSebenarnya') }),
            el('th', { className: 'is-end', text: label('selisih') }),
            el('th', { className: 'is-end', text: label('korKolomNilai') }),
            el('th', { text: MUT_TEXT.kolomAlasanKoreksi }),
          ),
        ),
        el('tbody', {}, ...rows),
        el(
          'tfoot',
          {},
          el(
            'tr',
            {},
            el('td', { attrs: { colspan: '6' }, text: label('korTotalNilai') }),
            el('td', { className: 'is-end', text: formatSignedRupiah(doc.totalValue) }),
            el('td'),
          ),
        ),
      ),
    ),
    el('p', {
      className: 'bo-korek-ba__reason',
      text: label('korBaAlasan', { alasan: doc.reason }),
    }),
    el(
      'div',
      { className: 'bo-korek-ba__signs' },
      signature(label('korBaDibuat'), doc.userName),
      signature(label('korBaDisetujui'), doc.authorizedBy ?? ''),
      signature(label('korBaMengetahui'), ''),
    ),
  );
  const handle = openModal({
    title: draft ? `${MUT_TEXT.draf} ${label('korCetakBa')}` : label('korCetakBa'),
    body,
    actions: [
      { text: label('tutup'), variant: 'secondary' },
      {
        text: label('cetak'),
        variant: 'primary',
        icon: 'printer',
        onClick: () => {
          logActivity(session, 'cetak', label('korLogCetak', { nomor: doc.number }));
          window.print();
        },
      },
    ],
  });
  handle.dialog.classList.add('bo-stok-modal');
}

// Koreksi Stok: daftar riwayat (gambar klien 16) dan, lewat "+ Koreksi Stok", formulir input
// (gambar 17) pada tab yang sama.
export function renderStockCorrection(
  session: BoSession,
  go: (path: string) => void,
  creating = false,
): ScreenHandle {
  return creating ? renderCorrectionForm(session, go) : renderCorrectionList(session, go);
}

const LIST_TEXT = {
  segarkan: 'Segarkan',
  cari: 'Cari koreksi...',
  cariNama: 'Cari nomor koreksi, petugas, atau alasan',
  kolomBarang: 'Jumlah Barang',
  tidakCocok: 'Tidak ada koreksi yang sesuai filter.',
  ditolak: 'Koreksi stok yang sudah tersimpan tidak dapat dihapus karena sudah mengubah stok.',
} as const;

// Daftar Koreksi Stok (gambar klien 16 dan 32): Tambah, Ubah, Hapus, Cetak, Keluar, filter Tanggal,
// pencarian, dan tabel koreksi. Ubah membuka Berita Acara koreksi terpilih.
function renderCorrectionList(session: BoSession, go: (path: string) => void): ScreenHandle {
  const ledger = ledgerFor(session.store);
  const today = wibDate(session.now());
  const selection = createRowSelection();
  const dateSelect = createDateFilter();
  const search = createSearchBox(LIST_TEXT.cariNama, LIST_TEXT.cari);
  const body = el('tbody');
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': MUT_TEXT.daftarKoreksi },
    },
    el(
      'table',
      { className: 'bo-trx-table bo-trx-table--list' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: label('korNoDokumen') }),
          el('th', { text: label('kolomWaktu') }),
          el('th', { className: 'is-end', text: LIST_TEXT.kolomBarang }),
          el('th', { text: label('korPetugas') }),
          el('th', { className: 'is-end', text: label('korKolomNilai') }),
          el('th', { text: label('korAlasan') }),
        ),
      ),
      body,
    ),
  );

  const docs = (): CorrectionDoc[] => [...ledger.docs()].reverse();

  const paint = (): void => {
    const all = docs();
    const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
    const rows = all.filter((doc) => {
      const day = wibDate(new Date(doc.at));
      if (range.startDate !== undefined && day < range.startDate) {
        return false;
      }
      if (range.endDate !== undefined && day > range.endDate) {
        return false;
      }
      return matchesPhrase(
        `${doc.number} ${doc.userName} ${doc.authorizedBy ?? ''} ${doc.reason}`,
        search.input.value,
      );
    });
    if (rows.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', {
            text: all.length === 0 ? label('korRiwayatKosong') : LIST_TEXT.tidakCocok,
            attrs: { colspan: '6' },
          }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((doc) => {
        const tr = el(
          'tr',
          { attrs: { 'data-number': doc.number } },
          el('td', {}, el('strong', { className: 'bo-trx-link', text: doc.number })),
          el('td', { className: 'bo-nowrap', text: stamp(doc.at) }),
          el('td', { className: 'is-end', text: formatDecimal(doc.lines.length) }),
          el(
            'td',
            {},
            el('span', { text: doc.userName }),
            doc.authorizedBy === undefined
              ? false
              : el('span', {
                  className: 'bo-mut-code',
                  text: label('korOtorisasiOleh', { nama: doc.authorizedBy }),
                }),
          ),
          el(
            'td',
            { className: 'is-end' },
            el('span', {
              className: toneOf(doc.totalValue),
              text: formatSignedRupiah(doc.totalValue),
            }),
          ),
          el('td', { className: 'bo-trx-notes', text: doc.reason, attrs: { title: doc.reason } }),
        );
        selection.attach(tr, doc.number);
        return tr;
      }),
    );
  };

  const open = (number: string): void => {
    const doc = docs().find((item) => item.number === number);
    if (doc !== undefined) {
      openReport(session, doc, false);
    }
  };

  dateSelect.addEventListener('change', paint);
  search.input.addEventListener('input', paint);
  const stop = ledger.subscribe(paint);
  const element = createListPage({
    title: label('korRiwayat'),
    kpis: [],
    selection,
    onCreate: () => {
      go(FORM_PATH);
    },
    onEdit: open,
    onDelete: () => {
      refuseDelete(LIST_TEXT.ditolak);
    },
    refresh: createRefreshButton(LIST_TEXT.segarkan, paint),
    filters: [dateSelect],
    search: search.root,
    table,
  });
  paint();
  if (justSaved !== undefined) {
    selection.select(justSaved);
  }
  return { element, destroy: stop };
}

function renderCorrectionForm(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const ledger = ledgerFor(store);
  let defaultWarehouse: WarehouseId = 'display';
  let lines: CorrectionDraftLine[] = [];
  let guard: PinGuard = INITIAL_GUARD;

  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const role = () => store.getState().role;
  const actor = () => actorOf(session);

  // --- Kepala halaman ---
  const numberOutput = el('output', { className: 'bo-mut-chip__value' });
  const dateOutput = el('output', { className: 'bo-mut-chip__value' });
  const chip = (text: string, output: HTMLElement): HTMLElement =>
    el(
      'div',
      { className: 'bo-mut-chip' },
      el('span', { className: 'bo-mut-chip__label', text }),
      output,
    );
  const head = el(
    'header',
    { className: 'bo-mut-title' },
    el(
      'div',
      { className: 'bo-mut-title__text' },
      el('h2', { className: 'bo-mut-title__heading', text: label('korJudul') }),
      el('p', { className: 'bo-mut-title__sub', text: label('korSub') }),
    ),
    el(
      'div',
      { className: 'bo-mut-chips' },
      chip(label('korNoDokumen'), numberOutput),
      chip(label('tanggal'), dateOutput),
      chip(
        label('korPetugas'),
        el('output', { className: 'bo-mut-chip__value', text: actor().name }),
      ),
    ),
  );
  const bannerBox = el('div', { className: 'bo-stok-banner' });

  // --- Formulir ---
  const warehouseField = createSelectField({
    labelText: label('kolomGudang'),
    options: WAREHOUSE_OPTIONS.map((option) => ({
      value: option.value,
      text: label(option.key),
    })),
    value: defaultWarehouse,
  });
  warehouseField.root.classList.add('bo-mut-warehouse');
  const tableBox = el('div', { className: 'bo-mut-linesbox' });
  const error = el('p', { className: 'bo-error bo-mut-error', attrs: { role: 'alert' } });
  const reasonListId = nextId('alasan-saran');
  const reasonList = el(
    'datalist',
    { attrs: { id: reasonListId } },
    ...REASON_PRESETS.map((key) => el('option', { attrs: { value: label(key) } })),
  );
  const countOutput = el('span', {
    className: 'bo-mut-summary__count',
    attrs: { 'aria-live': 'polite' },
  });
  const totalOutput = el('output', { className: 'bo-mut-summary__total' });
  const authNote = el('span', { className: 'bo-mut-summary__note' });

  const picker = createProductPicker({
    labelText: label('cariBarang'),
    products: () => store.getState().data.products,
    onPick: (product) => {
      error.textContent = '';
      const existing = lines.findIndex(
        (line) => line.productId === product.id && line.warehouse === defaultWarehouse,
      );
      if (existing < 0) {
        lines = [
          ...lines,
          {
            productId: product.id,
            warehouse: defaultWarehouse,
            unit: product.defaultUnit ?? product.baseUnit,
            actual: '',
            reason: '',
          },
        ];
        renderTable();
      }
      const index = existing < 0 ? lines.length - 1 : existing;
      document.querySelector<HTMLElement>(`[data-korek-actual="${String(index)}"]`)?.focus();
    },
  });
  picker.root.classList.add('bo-mut-picker');

  const updateSummary = (): void => {
    let changed = 0;
    let signed = 0;
    let absolute = 0;
    lines.forEach((line, index) => {
      const product = lookup(line.productId);
      const result = product === undefined ? undefined : evaluateLine(product, line, index);
      if (result?.ok === true && result.line.diffBase !== 0) {
        changed += 1;
        signed += result.line.value;
        absolute += Math.abs(result.line.value);
      }
    });
    countOutput.textContent = label('korRingkasanBaris', { jumlah: formatDecimal(changed) });
    totalOutput.textContent = formatSignedRupiah(signed);
    totalOutput.className = `bo-mut-summary__total ${toneOf(signed)}`;
    const needsPin = needsOwnerPin(role(), absolute);
    authNote.textContent = needsPin
      ? label('korButuhOtorisasi', { batas: formatRupiah(OWNER_PIN_LIMIT) })
      : label('korTanpaOtorisasi');
    authNote.classList.toggle('is-warning', needsPin);
  };

  const renderTable = (): void => {
    const body = el('tbody');
    lines.forEach((line, index) => {
      const product = lookup(line.productId);
      if (product === undefined) {
        return;
      }
      const systemCell = el('td', { className: 'is-end' });
      const diffCell = el('td', { className: 'is-end' });
      const valueCell = el('td', { className: 'is-end' });
      const actual = el('input', {
        className: 'input bo-mut-input bo-mut-actual',
        attrs: {
          inputmode: 'decimal',
          autocomplete: 'off',
          'aria-label': `${label('korKolomStokSebenarnya')} ${product.name}`,
          'data-korek-actual': String(index),
        },
      });
      actual.value = line.actual;
      const refresh = (): void => {
        const systemBase = product.stock[line.warehouse];
        systemCell.textContent = `${formatDecimal(fromBase(product, line.unit, systemBase), 3, 1)} ${line.unit}`;
        actual.classList.toggle('is-required', actual.value.trim() === '');
        const result = evaluateLine(product, line, index);
        if (!result.ok) {
          diffCell.replaceChildren(el('span', { className: 'bo-korek-diff', text: '-' }));
          valueCell.textContent = '-';
          return;
        }
        diffCell.replaceChildren(
          el('span', {
            className: toneOf(result.line.diffQty),
            text: `${formatSigned(result.line.diffQty, 3, 1)} ${line.unit}`,
          }),
        );
        valueCell.textContent = formatSignedRupiah(result.line.value);
      };

      const warehouse = el(
        'select',
        {
          className: 'input bo-mut-input',
          attrs: {
            'aria-label': `${label('kolomGudang')} ${product.name}`,
            'data-korek-warehouse': String(index),
          },
        },
        ...WAREHOUSE_OPTIONS.map((option) =>
          el('option', { text: label(option.key), attrs: { value: option.value } }),
        ),
      );
      warehouse.value = line.warehouse;
      warehouse.addEventListener('change', () => {
        lines = lines.map((item, position) =>
          position === index ? { ...item, warehouse: warehouse.value as WarehouseId } : item,
        );
        error.textContent = '';
        renderTable();
      });

      actual.addEventListener('input', () => {
        lines = lines.map((item, position) =>
          position === index ? { ...item, actual: actual.value } : item,
        );
        actual.removeAttribute('aria-invalid');
        error.textContent = '';
        refresh();
        updateSummary();
      });

      const unit = el(
        'select',
        {
          className: 'input bo-mut-input',
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
        refresh();
        updateSummary();
      });

      const reason = el('input', {
        className: 'input bo-mut-input bo-mut-reason',
        attrs: {
          type: 'text',
          maxlength: '200',
          autocomplete: 'off',
          list: reasonListId,
          placeholder: MUT_TEXT.tulisAlasan,
          'aria-label': `${MUT_TEXT.kolomAlasanKoreksi} ${product.name}`,
          'data-korek-reason': String(index),
        },
      });
      reason.value = line.reason ?? '';
      reason.addEventListener('input', () => {
        lines = lines.map((item, position) =>
          position === index ? { ...item, reason: reason.value } : item,
        );
        reason.removeAttribute('aria-invalid');
        error.textContent = '';
      });

      const remove = createButton({
        text: label('hapus'),
        variant: 'secondary',
        icon: 'trash-2',
        onClick: () => {
          lines = lines.filter((_, position) => position !== index);
          error.textContent = '';
          renderTable();
        },
      });
      remove.setAttribute('aria-label', `${label('hapus')} ${product.name}`);
      remove.title = `${label('hapus')} ${product.name}`;
      remove.classList.add('bo-mut-iconbtn');

      refresh();
      body.append(
        el(
          'tr',
          {},
          el(
            'td',
            { className: 'is-name' },
            el('span', { className: 'bo-mut-name', text: product.name }),
            el('span', { className: 'bo-mut-code', text: product.code }),
          ),
          el('td', {}, warehouse),
          systemCell,
          el('td', {}, actual),
          el('td', {}, unit),
          diffCell,
          valueCell,
          el('td', { className: 'is-reason' }, reason),
          el('td', { className: 'is-action' }, remove),
        ),
      );
    });

    tableBox.replaceChildren(
      lines.length === 0
        ? el(
            'div',
            { className: 'bo-mut-placeholder' },
            icon('package'),
            el('p', { text: label('korKosong') }),
          )
        : createScrollRegion(
            label('korDokumen'),
            el(
              'table',
              { className: 'bo-mut-table bo-mut-table--lines bo-mut-table--korek' },
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  el('th', { text: label('kolomNamaBarang') }),
                  el('th', { text: label('kolomGudang') }),
                  el('th', { className: 'is-end', text: label('stokSistem') }),
                  el('th', { text: label('korKolomStokSebenarnya') }),
                  el('th', { text: label('kolomSatuan') }),
                  el('th', { className: 'is-end', text: label('selisih') }),
                  el('th', { className: 'is-end', text: label('korKolomNilai') }),
                  el('th', { text: MUT_TEXT.kolomAlasanKoreksi }),
                  el(
                    'th',
                    { className: 'is-action' },
                    el('span', { className: 'visually-hidden', text: label('hapus') }),
                  ),
                ),
              ),
              body,
            ),
          ),
    );
    clear.toggleAttribute('data-inactive', lines.length === 0);
    clear.setAttribute('aria-disabled', lines.length === 0 ? 'true' : 'false');
    updateSummary();
  };

  // --- Simpan ---
  const showIssue = (issue: CorrectionIssue): void => {
    error.textContent = issueText(issue);
    const line = issue.line === undefined ? undefined : String(issue.line);
    if (issue.field === 'reason' && line !== undefined) {
      const target = document.querySelector<HTMLElement>(`[data-korek-reason="${line}"]`);
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
    } else if (line !== undefined && issue.field === 'actual') {
      const target = document.querySelector<HTMLElement>(`[data-korek-actual="${line}"]`);
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
    } else if (line !== undefined) {
      document.querySelector<HTMLElement>(`[data-korek-warehouse="${line}"]`)?.focus();
    } else {
      picker.input.focus();
    }
  };

  const apply = (
    plan: Extract<CorrectionPlan, { ok: true }>,
    authorizedBy: string | undefined,
  ): void => {
    const ids = [...new Set(plan.changed.map((line) => line.productId))];
    for (const id of ids) {
      const product = lookup(id);
      if (product !== undefined) {
        store.setStock(id, stockAfter(product, plan.changed));
      }
    }
    const doc = buildDoc({
      number: ledger.nextNumber(),
      at: session.now().toISOString(),
      user: actor(),
      authorizedBy,
      reason: combineReasons(plan.changed),
      lines: plan.changed,
    });
    ledger.add(doc);
    logActivity(
      session,
      'koreksi',
      label('korLogDetail', {
        nomor: doc.number,
        jumlah: formatDecimal(doc.lines.length),
        nilai: formatSignedRupiah(doc.totalValue),
        alasan: doc.reason,
        otorisasi:
          authorizedBy === undefined ? '' : label('korLogOtorisasi', { nama: authorizedBy }),
      }),
    );
    justSaved = doc.number;
    showToast({ kind: 'success', text: label('korTersimpan', { nomor: doc.number }) });
    lines = [];
    error.textContent = '';
    go(LIST_PATH);
  };

  const askOwner = (absolute: number): void => {
    const pinId = nextId('pin-owner');
    const pin = el('input', {
      className: 'input bo-korek-pin__input',
      attrs: {
        id: pinId,
        type: 'password',
        inputmode: 'numeric',
        maxlength: '6',
        autocomplete: 'off',
      },
    });
    const pinError = el('p', { className: 'bo-error', attrs: { role: 'alert' } });
    const approve = createButton({
      text: label('setujui'),
      icon: 'lock',
      onClick: () => {
        const result = checkOwnerPin(
          store.getState().data.users,
          pin.value,
          guard,
          session.now().getTime(),
        );
        guard = result.guard;
        if (result.kind === 'error') {
          pinError.textContent = message(result.messageId, result.values);
          pin.value = '';
          pin.focus();
          return;
        }
        handle.close();
        submit(result.owner.name);
      },
    });
    const handle = openModal({
      title: label('korOtorisasiJudul'),
      body: el(
        'div',
        { className: 'bo-korek-pin' },
        el('p', { text: label('korOtorisasiTeks', { nilai: formatRupiah(absolute) }) }),
        el('label', { className: 'field__label', text: label('pinOwner'), attrs: { for: pinId } }),
        pin,
        pinError,
      ),
      actions: [{ text: label('batal'), variant: 'secondary' }],
    });
    handle.dialog.querySelector('.modal__actions')?.append(approve);
    pin.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        approve.click();
      }
    });
    pin.focus();
  };

  const submit = (authorizedBy: string | undefined): void => {
    const plan = planCorrection(lines, '', lookup);
    if (!plan.ok) {
      showIssue(plan.issue);
      return;
    }
    if (needsOwnerPin(role(), plan.totalAbs) && authorizedBy === undefined) {
      askOwner(plan.totalAbs);
      return;
    }
    apply(plan, role() === 'owner' ? undefined : authorizedBy);
  };

  const save = createButton({
    text: label('korSimpan'),
    icon: 'save',
    onClick: () => {
      if (!store.getState().online) {
        error.textContent = message('MSG-001');
        return;
      }
      if (!session.allowed('BO-06', 'Simpan Mutasi')) {
        error.textContent = message('MSG-003');
        return;
      }
      error.textContent = '';
      submit(undefined);
    },
  });
  const confirmDiscard = (title: string, text: string, confirmText: string, then: () => void) => {
    openModal({
      title,
      body: text,
      actions: [
        { text: label('lanjutMengisi'), variant: 'secondary' },
        { text: confirmText, variant: 'danger', onClick: then },
      ],
    });
  };
  const cancel = createButton({
    text: label('batal'),
    variant: 'secondary',
    onClick: () => {
      if (lines.length === 0) {
        error.textContent = '';
        go(LIST_PATH);
        return;
      }
      confirmDiscard(
        label('kosongkanFormJudul'),
        label('kosongkanFormTeks'),
        label('kosongkan'),
        () => {
          lines = [];
          error.textContent = '';
          go(LIST_PATH);
        },
      );
    },
  });
  const clear = createButton({
    text: label('hapus'),
    variant: 'secondary',
    icon: 'trash-2',
    onClick: () => {
      if (lines.length === 0) {
        return;
      }
      confirmDiscard(MUT_TEXT.hapusDrafJudul, MUT_TEXT.hapusDrafTeks, MUT_TEXT.hapusDraf, () => {
        lines = [];
        error.textContent = '';
        renderTable();
        picker.input.focus();
      });
    },
  });
  const print = createButton({
    text: MUT_TEXT.cetak,
    variant: 'secondary',
    icon: 'printer',
    onClick: () => {
      const plan = planCorrection(lines, '', lookup);
      if (!plan.ok) {
        showIssue(plan.issue);
        return;
      }
      error.textContent = '';
      openReport(
        session,
        buildDoc({
          number: ledger.nextNumber(),
          at: session.now().toISOString(),
          user: actor(),
          authorizedBy: undefined,
          reason: combineReasons(plan.changed),
          lines: plan.changed,
        }),
        true,
      );
    },
  });

  warehouseField.select.addEventListener('change', () => {
    defaultWarehouse = warehouseField.select.value as WarehouseId;
  });

  const header = (): void => {
    numberOutput.textContent = ledger.nextNumber();
    dateOutput.textContent = formatDate(session.now());
  };
  const paintConnection = (): void => {
    const online = store.getState().online;
    save.disabled = !online;
    bannerBox.replaceChildren(...(online ? [] : [createBanner('offline', message('MSG-001'))]));
    updateSummary();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(element)) {
      return;
    }
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
  const stopStore = store.subscribe(paintConnection);
  const stopLedger = ledger.subscribe(header);

  const element = el(
    'div',
    { className: 'bo-mut bo-mut--form' },
    head,
    bannerBox,
    el(
      'section',
      { className: 'bo-mut-card bo-mut-card--korek', attrs: { 'aria-label': label('korDokumen') } },
      el(
        'div',
        { className: 'bo-mut-toolbar bo-mut-toolbar--card' },
        el('div', { className: 'bo-mut-toolbar__tools' }, picker.root, warehouseField.root),
        el('div', { className: 'bo-mut-toolbar__actions' }, save, cancel, clear, print),
      ),
      error,
      tableBox,
      el(
        'div',
        { className: 'bo-mut-summary' },
        countOutput,
        el(
          'span',
          { className: 'bo-mut-summary__line' },
          el('span', { text: label('korTotalNilai') }),
          totalOutput,
        ),
        authNote,
      ),
      reasonList,
    ),
  );
  header();
  renderTable();
  paintConnection();
  return {
    element,
    destroy: () => {
      stopStore();
      stopLedger();
      document.removeEventListener('keydown', onKey);
    },
  };
}
