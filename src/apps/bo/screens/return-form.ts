import '../../../styles/bo-retur.css';
import { el, nextId } from '../../../shared/dom';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { formatDate, formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField, type SelectOption } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import {
  customerBalance,
  defaultSettlement,
  describeImpact,
  findSource,
  hasRoom,
  partyKey,
  partyOptions,
  planSettlement,
  REASON_PRESETS,
  returnedValue,
  returnSources,
  SETTLEMENTS,
  settlementLabelKey,
  settlementsFor,
  suggestWarehouse,
  supplierBalance,
  UMUM_KEY,
  WAREHOUSE_LABELS,
  type ReturnKind,
  type ReturnPick,
  type ReturnSource,
  type Settlement,
  type SourceLine,
} from '../domain/returns';
import { parseQuantity } from '../domain/transfer';
import type { ScreenHandle } from './login';
import { saveReturn } from './return-actions';
import { createReturnList } from './return-list';
import { openReturnNote } from './return-print';
import { screenActive } from '../screen-active';

interface RowRef {
  readonly line: SourceLine;
  readonly row: HTMLTableRowElement;
  readonly check: HTMLInputElement;
  readonly input: HTMLInputElement;
  readonly value: HTMLElement;
}

const WAREHOUSES: readonly WarehouseId[] = ['display', 'besar'];
const PATHS: Readonly<Record<ReturnKind, string>> = {
  penjualan: '/bo/transaksi/retur-penjualan',
  pembelian: '/bo/transaksi/retur-pembelian',
};

function quantityText(value: number): string {
  return String(value).replace('.', ',');
}

function fillSelect(
  select: HTMLSelectElement,
  options: readonly SelectOption[],
  value: string,
): void {
  select.replaceChildren(
    ...options.map((option) => el('option', { text: option.text, attrs: { value: option.value } })),
  );
  select.value = options.some((option) => option.value === value)
    ? value
    : (options[0]?.value ?? '');
}

function fact(term: string, value: string | Node): HTMLElement {
  return el('div', { className: 'bo-ret-fact' }, el('dt', { text: term }), el('dd', {}, value));
}

export function renderReturnForm(
  session: BoSession,
  go: (path: string) => void,
  kind: ReturnKind,
): ScreenHandle {
  const store = session.store;
  const sale = kind === 'penjualan';
  let sources: ReturnSource[] = [];
  let source: ReturnSource | undefined;
  let rows: RowRef[] = [];
  let warehouseTouched = false;
  let productCache: { readonly ref: readonly Product[]; readonly map: Map<string, Product> } = {
    ref: [],
    map: new Map(),
  };

  const productsOf = (): Map<string, Product> => {
    const ref = store.getState().data.products;
    if (productCache.ref !== ref) {
      productCache = { ref, map: new Map(ref.map((product) => [product.id, product])) };
    }
    return productCache.map;
  };
  const readSources = (): ReturnSource[] =>
    returnSources(kind, store.getState().data, store.getState().returnNotes);
  const balanceOfParty = (): number => {
    if (source?.partyId === undefined) {
      return 0;
    }
    const data = store.getState().data;
    return sale
      ? customerBalance(data.customers.find((item) => item.id === source?.partyId))
      : supplierBalance(data.suppliers.find((item) => item.id === source?.partyId));
  };

  // ---------- Kepala halaman ----------
  const nextNumber = el('p', { className: 'bo-ret-sub' });
  const tab = (target: ReturnKind): HTMLButtonElement => {
    const button = el('button', {
      className: 'bo-ret-tab',
      text: label(target === 'penjualan' ? 'menuReturPenjualan' : 'menuReturPembelian'),
      attrs: { type: 'button', 'aria-current': target === kind && 'page' },
    });
    button.addEventListener('click', () => {
      if (target !== kind) {
        go(PATHS[target]);
      }
    });
    return button;
  };
  const resetButton = createButton({
    text: label('batal'),
    variant: 'secondary',
    icon: 'x',
    onClick: () => {
      reset(false);
      showToast({ kind: 'info', text: label('boReturFormKosong') });
    },
  });
  resetButton.title = label('boReturBatalTips');
  const saveTop = createButton({
    text: label('simpanRetur'),
    variant: 'primary',
    icon: 'check',
    onClick: () => {
      submit();
    },
  });
  saveTop.title = label('boReturSimpanTips');
  const head = el(
    'header',
    { className: 'bo-panel bo-ret-head' },
    el(
      'div',
      { className: 'bo-ret-head__main' },
      el('span', { className: 'bo-ret-head__icon' }, icon(sale ? 'receipt-text' : 'package-plus')),
      el(
        'div',
        {},
        el('h1', {
          className: 'bo-ret-title',
          text: label(sale ? 'menuReturPenjualan' : 'menuReturPembelian'),
        }),
        nextNumber,
      ),
    ),
    el(
      'div',
      {
        className: 'bo-ret-tabs',
        attrs: { role: 'group', 'aria-label': label('boReturJenisAria') },
      },
      tab('penjualan'),
      tab('pembelian'),
    ),
    el('div', { className: 'bo-ret-head__actions' }, resetButton, saveTop),
  );

  const errorHost = el('div', { className: 'bo-ret-error' });
  const showError = (text: string): void => {
    errorHost.replaceChildren(createBanner('danger', text));
    errorHost.scrollIntoView({ block: 'nearest' });
  };
  const clearError = (): void => {
    errorHost.replaceChildren();
  };

  // ---------- Faktur asal ----------
  const party = createSelectField({
    labelText: label(sale ? 'pelanggan' : 'boReturPihakPemasok'),
    options: [],
  });
  const invoice = createSelectField({
    labelText: label(sale ? 'boReturFakturLabel' : 'boReturFakturLabelBeli'),
    options: [],
  });
  const searchId = nextId('bo-ret-cari');
  const searchInput = el('input', {
    className: 'input',
    attrs: {
      id: searchId,
      type: 'search',
      placeholder: label('boReturCariHint'),
      autocomplete: 'off',
    },
  });
  const searchButton = createButton({
    text: label('cari'),
    variant: 'secondary',
    icon: 'search',
    onClick: () => {
      runSearch();
    },
  });
  const searchField = el(
    'div',
    { className: 'field' },
    el('label', {
      className: 'field__label',
      text: label('boReturCariFaktur'),
      attrs: { for: searchId },
    }),
    el('div', { className: 'bo-ret-search' }, searchInput, searchButton),
  );
  const facts = el('dl', { className: 'bo-ret-facts' });
  const sourceCard = el(
    'section',
    { className: 'bo-panel bo-ret-card' },
    el('h2', { className: 'bo-ret-card__title', text: label('boReturFakturAsal') }),
    el('div', { className: 'bo-ret-source' }, party.root, invoice.root, searchField),
    facts,
  );

  // ---------- Barang yang diretur ----------
  const tbody = el('tbody');
  const tableTotal = el('td', {
    className: 'bo-ret-num bo-ret-table__total',
    text: formatRupiah(0),
  });
  const table = el(
    'table',
    { className: 'pos-table bo-ret-table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { className: 'bo-ret-col-pick', text: label('kolomPilih') }),
        el('th', { text: label('boReturNotaBarang') }),
        el('th', { className: 'bo-ret-num', text: label('kolomDibeli') }),
        el('th', { className: 'bo-ret-num', text: label('kolomSudahDiretur') }),
        el('th', { className: 'bo-ret-col-qty', text: label('kolomJumlahRetur') }),
        el('th', { className: 'bo-ret-num', text: label('boReturKolomNilai') }),
      ),
    ),
    tbody,
    el(
      'tfoot',
      {},
      el(
        'tr',
        {},
        el('td', {
          className: 'bo-ret-table__foot',
          attrs: { colspan: '5' },
          text: label('boReturNotaTotal'),
        }),
        tableTotal,
      ),
    ),
  );
  const tableWrap = el('div', { className: 'bo-ret-table-wrap' }, table);
  const emptyBox = createEmptyState({
    icon: 'receipt-text',
    title: label('boReturBarangJudul'),
    description: label('boReturKosongBarang'),
  });
  const allReturned = createBanner('info', label('boReturSemuaDiretur'));
  const pickAll = createButton({
    text: label('boReturPilihSemua'),
    variant: 'secondary',
    onClick: () => {
      for (const ref of rows) {
        if (ref.line.room > 0) {
          ref.check.checked = true;
          ref.input.disabled = false;
          ref.input.value = quantityText(ref.line.room);
          ref.row.classList.add('is-picked');
        }
      }
      update();
    },
  });
  const pickNone = createButton({
    text: label('boReturKosongkanPilihan'),
    variant: 'secondary',
    onClick: () => {
      clearPicks();
      update();
    },
  });
  const itemsCard = el(
    'section',
    { className: 'bo-panel bo-ret-card' },
    el(
      'div',
      { className: 'bo-ret-card__head' },
      el('h2', { className: 'bo-ret-card__title', text: label('boReturBarangJudul') }),
      el('div', { className: 'bo-ret-card__tools' }, pickAll, pickNone),
    ),
    emptyBox,
    allReturned,
    tableWrap,
  );

  // ---------- Penyelesaian ----------
  const way = createSelectField({ labelText: label('boReturCara'), options: [] });
  const warehouse = createSelectField({
    labelText: label(sale ? 'boReturGudangMasuk' : 'boReturGudangKeluar'),
    options: WAREHOUSES.map((id) => ({ value: id, text: label(WAREHOUSE_LABELS[id]) })),
    value: 'display',
  });
  const reasonId = nextId('bo-ret-alasan');
  const reason = el('textarea', {
    className: 'input bo-ret-reason',
    attrs: { id: reasonId, rows: '3', placeholder: label('boReturAlasanHint') },
  });
  const chips = el(
    'div',
    {
      className: 'bo-ret-chips',
      attrs: { role: 'group', 'aria-label': label('boReturAlasanCepat') },
    },
    ...REASON_PRESETS[kind].map((key) => {
      const chip = el('button', {
        className: 'bo-ret-reason-chip',
        text: label(key),
        attrs: { type: 'button' },
      });
      chip.addEventListener('click', () => {
        reason.value = label(key);
        reason.focus();
        clearError();
      });
      return chip;
    }),
  );
  const totalValue = el('strong', { className: 'bo-ret-total__value', text: formatRupiah(0) });
  const impact = el('ul', { className: 'bo-ret-impact' });
  const saveBottom = createButton({
    text: label('simpanRetur'),
    variant: 'primary',
    icon: 'check',
    onClick: () => {
      submit();
    },
  });
  saveBottom.classList.add('bo-ret-save');
  const settleCard = el(
    'section',
    { className: 'bo-panel bo-ret-card' },
    el('h2', { className: 'bo-ret-card__title', text: label('boReturPenyelesaian') }),
    el(
      'div',
      { className: 'bo-ret-settle' },
      el(
        'div',
        { className: 'bo-ret-settle__fields' },
        el('div', { className: 'bo-ret-pair' }, way.root, warehouse.root),
        el(
          'div',
          { className: 'field' },
          el('label', {
            className: 'field__label',
            text: label('alasanRetur'),
            attrs: { for: reasonId },
          }),
          reason,
          chips,
        ),
      ),
      el(
        'div',
        { className: 'bo-ret-summary' },
        el(
          'div',
          { className: 'bo-ret-total' },
          el('span', { className: 'bo-ret-total__label', text: label('boReturNilai') }),
          totalValue,
        ),
        el('h3', { className: 'bo-ret-summary__title', text: label('boReturDampak') }),
        impact,
        saveBottom,
      ),
    ),
  );

  const list = createReturnList(session, kind);
  const main = el(
    'div',
    { className: 'bo-ret-main' },
    errorHost,
    sourceCard,
    itemsCard,
    settleCard,
  );
  const container = el(
    'div',
    { className: 'bo-form-page bo-ret' },
    head,
    el('div', { className: 'bo-ret-layout' }, main, list.element),
  );

  // ---------- Perilaku ----------
  function currentPicks(): ReturnPick[] {
    return rows
      .filter((ref) => ref.check.checked)
      .map((ref) => ({ index: ref.line.index, quantity: ref.input.value }));
  }

  function selectedSettlement(): Settlement {
    return SETTLEMENTS[kind].find((item) => item === way.select.value) ?? 'tunai';
  }

  function selectedWarehouse(): WarehouseId {
    return WAREHOUSES.find((id) => id === warehouse.select.value) ?? 'display';
  }

  function clearPicks(): void {
    for (const ref of rows) {
      ref.check.checked = false;
      ref.input.value = '';
      ref.input.disabled = true;
      ref.input.removeAttribute('aria-invalid');
      ref.row.classList.remove('is-picked');
    }
  }

  function renderFacts(): void {
    if (source === undefined) {
      facts.hidden = true;
      facts.replaceChildren();
      return;
    }
    facts.hidden = false;
    const settled = source.paid >= source.total;
    facts.replaceChildren(
      fact(label('boReturFaktaTanggal'), formatDate(new Date(source.date))),
      fact(label(sale ? 'pelanggan' : 'boReturPihakPemasok'), source.partyName),
      fact(label('boReturFaktaNilai'), formatRupiah(source.total)),
      fact(
        label('boReturFaktaDibayar'),
        el(
          'span',
          { className: 'bo-ret-paid' },
          el('span', { text: formatRupiah(source.paid) }),
          el(
            'span',
            { className: `badge ${settled ? 'badge--success' : 'badge--warning'}` },
            el('span', { text: label(settled ? 'statusLunas' : 'statusPending') }),
          ),
        ),
      ),
    );
  }

  function renderSettlementOptions(): void {
    const balance = balanceOfParty();
    const allowed = settlementsFor(kind, source).filter((item) => item !== 'potong' || balance > 0);
    fillSelect(
      way.select,
      allowed.map((item) => ({ value: item, text: label(settlementLabelKey(kind, item)) })),
      defaultSettlement(kind, source, balance),
    );
  }

  function buildRow(line: SourceLine): RowRef {
    const locked = line.room <= 0;
    const check = el('input', {
      className: 'bo-ret-check',
      attrs: {
        type: 'checkbox',
        'aria-label': label('boReturAriaPilih', { barang: line.name }),
        disabled: locked && '',
      },
    });
    const input = el('input', {
      className: 'input bo-ret-qty',
      attrs: {
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        'aria-label': label('boReturAriaJumlah', { barang: line.name }),
        disabled: '',
      },
    });
    const value = el('td', { className: 'bo-ret-num', text: '-' });
    const row = el(
      'tr',
      { className: locked ? 'is-locked' : '' },
      el('td', { className: 'bo-ret-col-pick' }, el('label', { className: 'bo-ret-pick' }, check)),
      el(
        'td',
        {},
        el('strong', { className: 'bo-ret-name', text: line.name }),
        el('div', { className: 'bo-ret-code', text: line.code }),
      ),
      el('td', {
        className: 'bo-ret-num',
        text: `${formatDecimal(line.sold, 3, 0)} ${line.unitName}`,
      }),
      el('td', {
        className: 'bo-ret-num',
        text: line.returned > 0 ? `${formatDecimal(line.returned, 3, 0)} ${line.unitName}` : '-',
      }),
      el(
        'td',
        { className: 'bo-ret-col-qty' },
        el('div', { className: 'bo-ret-qty-box' }, input, el('span', { text: line.unitName })),
      ),
      value,
    );
    check.addEventListener('change', () => {
      input.disabled = !check.checked;
      row.classList.toggle('is-picked', check.checked);
      if (check.checked && input.value.trim() === '') {
        input.value = quantityText(line.room);
      }
      clearError();
      update();
      if (check.checked) {
        input.focus();
        input.select();
      }
    });
    input.addEventListener('input', () => {
      if (!check.checked && input.value !== '') {
        check.checked = true;
        row.classList.add('is-picked');
      }
      clearError();
      update();
    });
    return { line, row, check, input, value };
  }

  function renderRows(): void {
    rows = source === undefined ? [] : source.lines.map(buildRow);
    tbody.replaceChildren(...rows.map((ref) => ref.row));
    const show = source !== undefined;
    emptyBox.hidden = show;
    tableWrap.hidden = !show;
    allReturned.hidden = !(source !== undefined && !hasRoom(source));
    pickAll.disabled = !(source !== undefined && hasRoom(source));
    pickNone.disabled = !show;
  }

  function update(): void {
    const picks = currentPicks();
    let total = 0;
    for (const ref of rows) {
      const quantity = parseQuantity(ref.input.value);
      const valid = quantity !== undefined && quantity > 0 && quantity <= ref.line.room;
      if (ref.check.checked && quantity !== undefined && quantity > 0 && !valid) {
        ref.input.setAttribute('aria-invalid', 'true');
      } else {
        ref.input.removeAttribute('aria-invalid');
      }
      const amount =
        ref.check.checked && quantity !== undefined && quantity > 0
          ? returnedValue(ref.line.line, quantity)
          : 0;
      ref.value.textContent = amount > 0 ? formatRupiah(amount) : '-';
      total += amount;
    }
    tableTotal.textContent = formatRupiah(total);
    totalValue.textContent = formatRupiah(total);
    if (!warehouseTouched) {
      warehouse.select.value = suggestWarehouse(kind, source, picks, productsOf());
    }
    const plan = planSettlement(kind, selectedSettlement(), total, balanceOfParty());
    const items = new Set(
      picks.flatMap((pick) => {
        const line = source?.lines[pick.index];
        return line === undefined ? [] : [line.line.productId];
      }),
    ).size;
    const lines = describeImpact(kind, selectedWarehouse(), selectedSettlement(), plan, items);
    impact.replaceChildren(
      ...(lines.length === 0
        ? [el('li', { className: 'bo-ret-impact__empty', text: label('boReturBelumDipilih') })]
        : lines.map((row) =>
            el(
              'li',
              { className: 'bo-ret-impact__row' },
              icon(row.icon),
              el('span', { text: row.text }),
            ),
          )),
    );
  }

  function refreshNumber(): void {
    nextNumber.textContent = label('boReturNomorBerikut', {
      nomor: store.peekNumber(sale ? 'RJ' : 'RB'),
    });
  }

  function loadSource(number: string): void {
    source = sources.find((item) => item.number === number);
    warehouseTouched = false;
    renderFacts();
    renderRows();
    renderSettlementOptions();
    update();
  }

  function fillInvoices(key: string, preferred?: string): void {
    const own = sources.filter((item) => partyKey(item) === key);
    const options: SelectOption[] = [
      { value: '', text: label('boReturPilihFakturOpsi') },
      ...own.map((item) => ({
        value: item.number,
        text: `${item.number} | ${formatDate(new Date(item.date))} | ${formatRupiah(item.total)}`,
      })),
    ];
    const first = preferred ?? (own.find(hasRoom) ?? own[0])?.number ?? '';
    fillSelect(invoice.select, options, first);
    loadSource(invoice.select.value);
  }

  function fillParties(selected: string): void {
    const options: SelectOption[] = [
      { value: '', text: label(sale ? 'boReturPilihPelanggan' : 'boReturPilihPemasok') },
      ...partyOptions(sources).map((item) => ({
        value: item.key,
        text: `${item.key === UMUM_KEY ? label('boReturPelangganUmum') : item.name} (${label('boReturJumlahFaktur', { jumlah: item.count })})`,
      })),
    ];
    fillSelect(party.select, options, selected);
  }

  function runSearch(): void {
    const found = findSource(sources, searchInput.value);
    if (found === undefined) {
      showError(label('boReturFakturTidakAda'));
      return;
    }
    clearError();
    fillParties(partyKey(found));
    fillInvoices(partyKey(found), found.number);
  }

  function reset(keepSource: boolean): void {
    clearError();
    reason.value = '';
    warehouseTouched = false;
    searchInput.value = '';
    if (keepSource && source !== undefined) {
      const key = partyKey(source);
      sources = readSources();
      fillParties(key);
      fillInvoices(key, source.number);
    } else {
      sources = readSources();
      fillParties('');
      fillInvoices('');
    }
    refreshNumber();
  }

  function submit(): void {
    const result = saveReturn(session, kind, {
      source,
      picks: currentPicks(),
      reason: reason.value,
      settlement: selectedSettlement(),
      warehouse: selectedWarehouse(),
    });
    if (!result.ok) {
      showError(result.text);
      const target =
        result.index === undefined
          ? undefined
          : rows.find((ref) => ref.line.index === result.index);
      if (target !== undefined) {
        target.input.setAttribute('aria-invalid', 'true');
        target.input.focus();
      } else if (reason.value.trim() === '' && source !== undefined) {
        reason.focus();
      }
      return;
    }
    showToast({
      kind: 'success',
      text: label('returTersimpan', {
        nomor: result.note.number,
        nilai: formatRupiah(result.note.total),
      }),
    });
    reset(true);
    list.refresh();
    openReturnNote(session, result.note);
  }

  party.select.addEventListener('change', () => {
    clearError();
    if (party.select.value === '') {
      fillInvoices('');
    } else {
      fillInvoices(party.select.value);
    }
  });
  invoice.select.addEventListener('change', () => {
    clearError();
    loadSource(invoice.select.value);
  });
  way.select.addEventListener('change', update);
  warehouse.select.addEventListener('change', () => {
    warehouseTouched = true;
    update();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });

  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(container)) {
      return;
    }
    if (document.body.classList.contains('is-modal-open')) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      submit();
    } else if (
      event.key === 'Escape' &&
      !(event.target instanceof HTMLElement && event.target.matches('input, select, textarea'))
    ) {
      reset(false);
    }
  };
  document.addEventListener('keydown', onKey);

  // Keadaan awal: form kosong pada jenis retur yang dipilih.
  sources = readSources();
  fillParties('');
  fillInvoices('');
  refreshNumber();

  return {
    element: container,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
    },
  };
}
