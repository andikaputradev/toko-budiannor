import '../../../styles/bo-stok.css';
import { el, nextId } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
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
  evaluateLine,
  ledgerFor,
  needsOwnerPin,
  OWNER_PIN_LIMIT,
  planCorrection,
  stockAfter,
  warehousesOf,
  type CorrectionDoc,
  type CorrectionDraftLine,
  type CorrectionIssue,
  type CorrectionPlan,
} from '../domain/stock-correction';
import { formatSigned, formatSignedRupiah } from '../domain/stock-report';
import { createProductPicker } from '../picker';
import type { ScreenHandle } from './login';
import { screenActive } from '../screen-active';

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

export function renderStockCorrection(session: BoSession): ScreenHandle {
  const store = session.store;
  const ledger = ledgerFor(store);
  let defaultWarehouse: WarehouseId = 'display';
  let lines: CorrectionDraftLine[] = [];
  let guard: PinGuard = INITIAL_GUARD;
  let justSaved: string | undefined;

  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const role = () => store.getState().role;
  const actor = (): { readonly id: string; readonly name: string } => {
    const state = store.getState();
    const user = session.state().user ?? state.data.users.find((item) => item.id === state.userId);
    return { id: user?.id ?? state.userId, name: user?.name ?? state.userId };
  };
  const log = (kind: 'koreksi' | 'cetak', detail: string): void => {
    store.logActivity({
      at: session.now().toISOString(),
      userId: actor().id,
      device: BO_DEVICE,
      ip: BO_IP,
      kind,
      detail,
    });
  };

  // --- Kepala halaman ---
  const numberOutput = el('output', { className: 'bo-stok-fact__value' });
  const dateOutput = el('output', { className: 'bo-stok-fact__value' });
  const fact = (text: string, output: HTMLElement): HTMLElement =>
    el(
      'div',
      { className: 'bo-stok-fact' },
      el('span', { className: 'bo-stok-fact__label', text }),
      output,
    );
  const head = el(
    'header',
    { className: 'bo-stok-head' },
    el(
      'div',
      { className: 'bo-stok-head__text' },
      el('h2', { className: 'bo-stok-head__title', text: label('korJudul') }),
      el('p', { className: 'bo-stok-head__sub', text: label('korSub') }),
    ),
    el(
      'div',
      { className: 'bo-stok-head__facts' },
      fact(label('korNoDokumen'), numberOutput),
      fact(label('tanggal'), dateOutput),
      fact(
        label('korPetugas'),
        el('output', { className: 'bo-stok-fact__value', text: actor().name }),
      ),
    ),
  );
  const bannerBox = el('div', { className: 'bo-stok-banner' });

  // --- Formulir ---
  const warehouseField = createSelectField({
    labelText: label('korGudangBawaan'),
    options: WAREHOUSE_OPTIONS.map((option) => ({
      value: option.value,
      text: label(option.key),
    })),
    value: defaultWarehouse,
  });
  warehouseField.root.classList.add('bo-korek__warehouse');
  const tableBox = el('div', { className: 'bo-korek__table' });
  const error = el('p', { className: 'bo-error bo-korek__error', attrs: { role: 'alert' } });
  const reasonId = nextId('alasan-koreksi');
  const hintId = nextId('alasan-bantuan');
  const reason = el('textarea', {
    className: 'input bo-korek__reason-input',
    attrs: { id: reasonId, rows: '3', maxlength: '300', 'aria-describedby': hintId },
  });
  const countOutput = el('p', {
    className: 'bo-korek-summary__count',
    attrs: { 'aria-live': 'polite' },
  });
  const totalOutput = el('output', { className: 'bo-korek-summary__total' });
  const authNote = el('p', { className: 'bo-korek-summary__note' });
  const historyBox = el('section', { className: 'bo-panel bo-korek__history' });

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
          },
        ];
        renderTable();
      }
      const index = existing < 0 ? lines.length - 1 : existing;
      document.querySelector<HTMLElement>(`[data-korek-actual="${String(index)}"]`)?.focus();
    },
  });
  picker.root.classList.add('bo-korek__picker');

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
    totalOutput.className = `bo-korek-summary__total ${toneOf(signed)}`;
    const needsPin = needsOwnerPin(role(), absolute);
    authNote.textContent =
      lines.length === 0
        ? ''
        : needsPin
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
      const refresh = (): void => {
        const systemBase = product.stock[line.warehouse];
        systemCell.textContent = `${formatDecimal(fromBase(product, line.unit, systemBase), 3, 1)} ${line.unit}`;
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
          className: 'input',
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

      const actual = el('input', {
        className: 'input bo-korek__actual',
        attrs: {
          inputmode: 'decimal',
          autocomplete: 'off',
          'aria-label': `${label('korKolomStokSebenarnya')} ${product.name}`,
          'data-korek-actual': String(index),
        },
      });
      actual.value = line.actual;
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
          className: 'input',
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
      remove.classList.add('bo-korek__remove');

      refresh();
      body.append(
        el(
          'tr',
          {},
          el(
            'td',
            {},
            el('span', { className: 'bo-korek__name', text: product.name }),
            el('span', { className: 'bo-korek__code', text: product.code }),
          ),
          el('td', {}, warehouse),
          systemCell,
          el('td', {}, actual),
          el('td', {}, unit),
          diffCell,
          valueCell,
          el('td', {}, remove),
        ),
      );
    });

    tableBox.replaceChildren(
      lines.length === 0
        ? el(
            'div',
            { className: 'bo-korek__empty' },
            icon('package'),
            el('p', { text: label('korKosong') }),
          )
        : el(
            'div',
            { className: 'bo-stok-scroll' },
            el(
              'table',
              {
                className: 'pos-table bo-stok-table bo-korek__lines',
                attrs: { 'aria-label': label('korDokumen') },
              },
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
                  el(
                    'th',
                    { className: 'bo-korek__th-action' },
                    el('span', { className: 'visually-hidden', text: label('hapus') }),
                  ),
                ),
              ),
              body,
            ),
          ),
    );
    updateSummary();
  };

  // --- Riwayat dan Berita Acara ---
  const openReport = (doc: CorrectionDoc): void => {
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
      title: label('korCetakBa'),
      body,
      actions: [
        { text: label('tutup'), variant: 'secondary' },
        {
          text: label('cetak'),
          variant: 'primary',
          icon: 'printer',
          onClick: () => {
            log('cetak', label('korLogCetak', { nomor: doc.number }));
            window.print();
          },
        },
      ],
    });
    handle.dialog.classList.add('bo-stok-modal');
  };

  const renderHistory = (): void => {
    const docs = [...ledger.docs()].reverse();
    historyBox.replaceChildren(
      el('h3', { className: 'bo-stok-panel-title', text: label('korRiwayat') }),
      docs.length === 0
        ? el('p', { className: 'bo-stok-note', text: label('korRiwayatKosong') })
        : el(
            'div',
            { className: 'bo-stok-scroll' },
            el(
              'table',
              { className: 'pos-table bo-stok-table bo-korek__log' },
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  el('th', { text: label('korNoDokumen') }),
                  el('th', { text: label('kolomWaktu') }),
                  el('th', { text: label('korPetugas') }),
                  el('th', { text: label('kolomNamaBarang') }),
                  el('th', { className: 'is-end', text: label('korKolomNilai') }),
                  el('th', { text: label('korAlasan') }),
                  el(
                    'th',
                    { className: 'bo-korek__th-action' },
                    el('span', { className: 'visually-hidden', text: label('korCetakBa') }),
                  ),
                ),
              ),
              el(
                'tbody',
                {},
                ...docs.map((doc) => {
                  const open = createButton({
                    text: label('korCetakBa'),
                    variant: 'secondary',
                    icon: 'printer',
                    onClick: () => {
                      openReport(doc);
                    },
                  });
                  open.setAttribute('aria-label', `${label('korCetakBa')} ${doc.number}`);
                  return el(
                    'tr',
                    { className: doc.number === justSaved ? 'is-selected' : '' },
                    el('td', {}, el('strong', { text: doc.number })),
                    el('td', { text: stamp(doc.at) }),
                    el(
                      'td',
                      {},
                      el('span', { text: doc.userName }),
                      doc.authorizedBy === undefined
                        ? false
                        : el('span', {
                            className: 'bo-korek__code',
                            text: label('korOtorisasiOleh', { nama: doc.authorizedBy }),
                          }),
                    ),
                    el(
                      'td',
                      {},
                      el('span', {
                        text: label('korBarangJumlah', { jumlah: formatDecimal(doc.lines.length) }),
                      }),
                      el('span', {
                        className: 'bo-korek__code',
                        text: warehousesOf(doc)
                          .map((warehouse) => warehouseName(warehouse))
                          .join(', '),
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
                    el('td', { className: 'bo-korek__log-reason', text: doc.reason }),
                    el('td', {}, open),
                  );
                }),
              ),
            ),
          ),
    );
  };

  // --- Simpan ---
  const showIssue = (issue: CorrectionIssue): void => {
    error.textContent = issueText(issue);
    const line = issue.line === undefined ? undefined : String(issue.line);
    if (issue.field === 'reason') {
      reason.setAttribute('aria-invalid', 'true');
      reason.focus();
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
      reason: reason.value,
      lines: plan.changed,
    });
    ledger.add(doc);
    log(
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
    reason.value = '';
    error.textContent = '';
    renderTable();
    renderHistory();
    header();
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
    const plan = planCorrection(lines, reason.value, lookup);
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
  const cancel = createButton({
    text: label('batal'),
    variant: 'secondary',
    onClick: () => {
      if (lines.length === 0 && reason.value.trim() === '') {
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
              reason.value = '';
              error.textContent = '';
              renderTable();
            },
          },
        ],
      });
    },
  });

  warehouseField.select.addEventListener('change', () => {
    defaultWarehouse = warehouseField.select.value as WarehouseId;
  });
  reason.addEventListener('input', () => {
    reason.removeAttribute('aria-invalid');
    error.textContent = '';
  });
  const presets = el(
    'div',
    { className: 'bo-korek__presets', attrs: { role: 'group', 'aria-label': label('korAlasan') } },
    ...REASON_PRESETS.map((key) => {
      const chip = el('button', {
        className: 'chip',
        text: label(key),
        attrs: { type: 'button' },
      });
      chip.addEventListener('click', () => {
        const text = label(key);
        const current = reason.value.trim();
        if (!current.includes(text)) {
          reason.value = current === '' ? text : `${current}; ${text}`;
        }
        reason.removeAttribute('aria-invalid');
        error.textContent = '';
        reason.focus();
      });
      return chip;
    }),
  );

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
  const stopLedger = ledger.subscribe(() => {
    renderHistory();
    header();
  });

  const element = el(
    'div',
    { className: 'bo-stok-page bo-korek' },
    head,
    bannerBox,
    el(
      'section',
      { className: 'bo-panel bo-korek__form' },
      el('h3', { className: 'bo-stok-panel-title', text: label('korDokumen') }),
      el('div', { className: 'bo-korek__tools' }, picker.root, warehouseField.root),
      tableBox,
      el(
        'div',
        { className: 'bo-korek__reason' },
        el('label', {
          className: 'field__label',
          text: label('korAlasan'),
          attrs: { for: reasonId },
        }),
        reason,
        el('p', {
          className: 'bo-stok-note',
          text: label('korAlasanBantuan'),
          attrs: { id: hintId },
        }),
        presets,
      ),
      el(
        'div',
        { className: 'bo-korek-summary' },
        el(
          'div',
          { className: 'bo-korek-summary__main' },
          countOutput,
          el(
            'p',
            { className: 'bo-korek-summary__line' },
            el('span', { text: label('korTotalNilai') }),
            totalOutput,
          ),
        ),
        authNote,
      ),
      error,
      el('div', { className: 'bo-form__actions' }, cancel, save),
    ),
    historyBox,
  );
  header();
  renderTable();
  renderHistory();
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
