import '../../../styles/bo-retur.css';
import { el, nextId } from '../../../shared/dom';
import type { Customer, DepositEntry } from '../../../shared/data/types';
import { wibDate } from '../../../shared/data/receivable';
import { formatDate, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import {
  depositHistory,
  depositOf,
  depositRows,
  holderCount,
  maxUsable,
  parseMoney,
  previewUse,
  receivableOf,
  todayTotals,
  totalDeposit,
  type DepositFilter,
} from '../domain/deposit';
import { openExportPreview } from '../export-preview';
import { createAmountInput } from './deposit-amount';
import { spendDeposit, topUpDeposit } from './deposit-actions';
import { openDepositReceipt } from './deposit-print';
import type { ScreenHandle } from './login';

type DepositTab = 'setor' | 'pakai';

const FILTERS: readonly DepositFilter[] = ['bersaldo', 'semua'];

function stat(title: string, value: HTMLElement, hint: HTMLElement): HTMLElement {
  return el(
    'div',
    { className: 'bo-panel bo-dep-stat' },
    el('span', { className: 'bo-dep-stat__label', text: title }),
    value,
    hint,
  );
}

function tile(title: string, value: string, main = false): HTMLElement {
  return el(
    'div',
    { className: main ? 'bo-dep-tile is-main' : 'bo-dep-tile' },
    el('span', { text: title }),
    el('strong', { text: value }),
  );
}

export function renderDeposit(session: BoSession): ScreenHandle {
  const store = session.store;
  let query = '';
  let filter: DepositFilter = 'bersaldo';
  let tab: DepositTab = 'setor';
  let selectedId: string | undefined;

  const customers = (): readonly Customer[] => store.getState().data.customers;
  const selected = (): Customer | undefined => customers().find((item) => item.id === selectedId);
  const today = (): string => wibDate(session.now());

  // ---------- Kepala dan ringkasan ----------
  const exportRows = (): string[][] =>
    depositRows(customers(), query, filter).map((row) => [
      row.customer.code,
      row.customer.name,
      row.customer.phone,
      formatRupiah(row.deposit),
      formatRupiah(row.outstanding),
    ]);
  const exportColumns = (): string[] => [
    label('kolomKode'),
    label('pelanggan'),
    label('telepon'),
    label('labelSaldoDeposit'),
    label('boDepositKolomPiutang'),
  ];
  const head = el(
    'header',
    { className: 'bo-panel bo-dep-head' },
    el(
      'div',
      { className: 'bo-ret-head__main' },
      el('span', { className: 'bo-ret-head__icon' }, icon('wallet')),
      el(
        'div',
        {},
        el('h1', { className: 'bo-ret-title', text: label('menuDepositPelanggan') }),
        el('p', { className: 'bo-ret-sub', text: label('boDepositSubjudul') }),
      ),
    ),
    el(
      'div',
      { className: 'bo-ret-head__actions' },
      createButton({
        text: label('eksporPdf'),
        variant: 'secondary',
        icon: 'file-down',
        onClick: () => {
          openExportPreview({
            kind: 'pdf',
            title: label('boDepositEksporJudul'),
            columns: exportColumns(),
            rows: exportRows(),
          });
        },
      }),
      createButton({
        text: label('eksporExcel'),
        variant: 'secondary',
        icon: 'download',
        onClick: () => {
          openExportPreview({
            kind: 'excel',
            title: label('boDepositEksporJudul'),
            columns: exportColumns(),
            rows: exportRows(),
          });
        },
      }),
    ),
  );

  const statTotal = el('strong', { className: 'bo-dep-stat__value' });
  const statTotalHint = el('span', { className: 'bo-dep-stat__hint' });
  const statHolders = el('strong', { className: 'bo-dep-stat__value' });
  const statHoldersHint = el('span', { className: 'bo-dep-stat__hint' });
  const statIn = el('strong', { className: 'bo-dep-stat__value' });
  const statInHint = el('span', { className: 'bo-dep-stat__hint' });
  const statOut = el('strong', { className: 'bo-dep-stat__value' });
  const statOutHint = el('span', { className: 'bo-dep-stat__hint' });
  const stats = el(
    'div',
    { className: 'bo-dep-stats' },
    stat(label('boDepositStatTotal'), statTotal, statTotalHint),
    stat(label('boDepositStatPemilik'), statHolders, statHoldersHint),
    stat(label('boDepositStatMasuk'), statIn, statInHint),
    stat(label('boDepositStatKeluar'), statOut, statOutHint),
  );

  // ---------- Daftar saldo ----------
  const searchId = nextId('bo-dep-cari');
  const searchInput = el('input', {
    className: 'input',
    attrs: {
      id: searchId,
      type: 'search',
      placeholder: label('boDepositCari'),
      'aria-label': label('boDepositCari'),
      autocomplete: 'off',
    },
  });
  const filterButtons = FILTERS.map((item) => {
    const button = el('button', {
      className: 'bo-dep-seg__item',
      text: label(item === 'bersaldo' ? 'boDepositFilterBersaldo' : 'boDepositFilterSemua'),
      attrs: { type: 'button' },
    });
    button.addEventListener('click', () => {
      filter = item;
      renderList();
    });
    return { item, button };
  });
  const listBody = el('tbody');
  const listEmpty = el('p', { className: 'bo-dep-empty', text: label('boDepositKosong') });
  const listTable = el(
    'table',
    { className: 'pos-table bo-dep-table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: label('pelanggan') }),
        el('th', { className: 'bo-dep-num', text: label('labelSaldoDeposit') }),
        el('th', { className: 'bo-dep-num', text: label('boDepositKolomPiutang') }),
      ),
    ),
    listBody,
  );
  const listTotal = el('strong');
  const listPanel = el(
    'section',
    { className: 'bo-panel bo-dep-panel' },
    el('h2', { className: 'bo-ret-card__title', text: label('boDepositDaftarJudul') }),
    el(
      'div',
      { className: 'bo-dep-search' },
      searchInput,
      el(
        'div',
        {
          className: 'bo-dep-seg',
          attrs: { role: 'group', 'aria-label': label('boDepositFilterAria') },
        },
        ...filterButtons.map((entry) => entry.button),
      ),
    ),
    el('div', { className: 'bo-dep-table-wrap' }, listTable, listEmpty),
    el(
      'div',
      { className: 'bo-dep-foot' },
      el('span', { text: label('boDepositTotalDaftar') }),
      listTotal,
    ),
  );

  const detail = el('section', { className: 'bo-panel bo-dep-panel' });
  const container = el(
    'div',
    { className: 'bo-form-page bo-dep' },
    head,
    stats,
    el('div', { className: 'bo-dep-layout' }, listPanel, detail),
  );

  // ---------- Perilaku ----------
  function renderStats(): void {
    const all = customers();
    const flow = todayTotals(store.getState().depositEntries, today());
    statTotal.textContent = formatRupiah(totalDeposit(all));
    statTotalHint.textContent = label('boDepositStatPelanggan', { jumlah: holderCount(all) });
    statHolders.textContent = String(holderCount(all));
    statHoldersHint.textContent = label('boDepositStatPelanggan', { jumlah: all.length });
    statIn.textContent = formatRupiah(flow.inflow);
    statInHint.textContent = formatDate(session.now());
    statOut.textContent = formatRupiah(flow.outflow);
    statOutHint.textContent = formatDate(session.now());
  }

  function renderList(): void {
    for (const entry of filterButtons) {
      entry.button.setAttribute('aria-pressed', entry.item === filter ? 'true' : 'false');
    }
    const rows = depositRows(customers(), query, filter);
    listEmpty.hidden = rows.length > 0;
    listTable.hidden = rows.length === 0;
    listTotal.textContent = formatRupiah(rows.reduce((sum, row) => sum + row.deposit, 0));
    listBody.replaceChildren(
      ...rows.map((row) => {
        const tr = el(
          'tr',
          {
            className: row.customer.id === selectedId ? 'bo-dep-row is-selected' : 'bo-dep-row',
            attrs: {
              tabindex: '0',
              'aria-selected': row.customer.id === selectedId ? 'true' : 'false',
            },
          },
          el(
            'td',
            {},
            el('span', { className: 'bo-dep-name', text: row.customer.name }),
            el('span', {
              className: 'bo-dep-sub',
              text: `${row.customer.code} | ${row.customer.phone}`,
            }),
          ),
          el('td', { className: 'bo-dep-num', text: formatRupiah(row.deposit) }),
          el('td', {
            className: 'bo-dep-num',
            text: row.outstanding > 0 ? formatRupiah(row.outstanding) : '-',
          }),
        );
        const choose = (): void => {
          selectedId = row.customer.id;
          renderList();
          renderDetail();
        };
        tr.addEventListener('click', choose);
        tr.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose();
          }
        });
        return tr;
      }),
    );
  }

  function refreshAll(): void {
    renderStats();
    renderList();
    renderDetail();
  }

  function historyTable(customer: Customer): HTMLElement {
    const rows = depositHistory(customer, store.getState().depositEntries);
    if (rows.length === 0) {
      return el('p', { className: 'bo-dep-empty', text: label('boDepositRiwayatKosong') });
    }
    const receiptCell = (entry: DepositEntry | undefined, number: string): HTMLElement => {
      if (entry === undefined || entry.kind === 'retur') {
        return el('span', { className: 'bo-dep-sub', text: number });
      }
      const link = el(
        'button',
        {
          className: 'bo-dep-link',
          attrs: { type: 'button', title: label('boDepositCetakBukti') },
        },
        icon('printer'),
        el('span', { text: number }),
      );
      link.addEventListener('click', () => {
        openDepositReceipt(session, entry);
      });
      return link;
    };
    return el(
      'div',
      { className: 'bo-dep-table-wrap' },
      el(
        'table',
        { className: 'pos-table bo-dep-table bo-dep-history' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('tanggal') }),
            el('th', { text: label('keterangan') }),
            el('th', { className: 'bo-dep-num', text: label('boDepositKolomMasuk') }),
            el('th', { className: 'bo-dep-num', text: label('boDepositKolomKeluar') }),
            el('th', { className: 'bo-dep-num', text: label('boDepositKolomSaldo') }),
          ),
        ),
        el(
          'tbody',
          {},
          ...rows.map((row) =>
            el(
              'tr',
              {},
              el(
                'td',
                {},
                el('span', {
                  className: 'bo-dep-name',
                  text: row.at === '' ? '-' : formatDate(new Date(row.at)),
                }),
                receiptCell(row.entry, row.number),
              ),
              el('td', { text: row.description }),
              el('td', {
                className: 'bo-dep-num bo-dep-in',
                text: row.inflow > 0 ? formatRupiah(row.inflow) : '-',
              }),
              el('td', {
                className: 'bo-dep-num',
                text: row.outflow > 0 ? formatRupiah(row.outflow) : '-',
              }),
              el('td', { className: 'bo-dep-num', text: formatRupiah(row.balance) }),
            ),
          ),
        ),
      ),
    );
  }

  function topUpForm(customer: Customer): HTMLElement {
    const errorHost = el('div', { className: 'bo-dep-error' });
    const amountId = nextId('bo-dep-setor');
    const noteId = nextId('bo-dep-ket');
    const dateId = nextId('bo-dep-tgl');
    const amount = createAmountInput(amountId, label('boDepositJumlahSetor'), () => {
      errorHost.replaceChildren();
    });
    const method = createSelectField({
      labelText: label('labelCaraBayar'),
      options: [
        { value: 'tunai', text: label('metodeTunai') },
        { value: 'transfer', text: label('labelMetodeTransfer') },
      ],
    });
    const note = el('input', {
      className: 'input',
      attrs: { id: noteId, type: 'text', autocomplete: 'off', maxlength: '120' },
    });
    const save = createButton({
      text: label('boDepositSimpanSetor'),
      variant: 'primary',
      icon: 'check',
      onClick: () => {
        const result = topUpDeposit(
          session,
          customer.id,
          amount.value(),
          method.select.value === 'transfer' ? 'transfer' : 'tunai',
          note.value,
        );
        if (!result.ok) {
          errorHost.replaceChildren(createBanner('danger', result.text));
          amount.element.focus();
          return;
        }
        showToast({
          kind: 'success',
          text: label('boDepositSetorTersimpan', {
            nomor: result.entry.number,
            nilai: formatRupiah(result.entry.amount),
          }),
        });
        refreshAll();
        openDepositReceipt(session, result.entry);
      },
    });
    return el(
      'div',
      { className: 'bo-dep-form' },
      el(
        'div',
        { className: 'bo-dep-form__row' },
        el(
          'div',
          { className: 'field' },
          el('label', {
            className: 'field__label',
            text: label('tanggal'),
            attrs: { for: dateId },
          }),
          el('input', {
            className: 'input',
            attrs: { id: dateId, type: 'text', readonly: '', value: formatDate(session.now()) },
          }),
        ),
        method.root,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', {
          className: 'field__label',
          text: label('boDepositJumlahSetor'),
          attrs: { for: amountId },
        }),
        el('div', { className: 'bo-dep-amount' }, amount.element),
      ),
      el(
        'div',
        { className: 'field' },
        el('label', {
          className: 'field__label',
          text: label('keterangan'),
          attrs: { for: noteId },
        }),
        note,
      ),
      errorHost,
      el('div', { className: 'bo-dep-actions' }, save),
    );
  }

  function spendForm(customer: Customer): HTMLElement {
    const balance = depositOf(customer);
    const owed = receivableOf(customer);
    const usable = maxUsable(customer);
    if (balance <= 0 || owed <= 0) {
      return el('p', {
        className: 'bo-dep-empty',
        text: label(balance <= 0 ? 'boDepositTanpaSaldo' : 'boDepositTanpaPiutang'),
      });
    }
    const errorHost = el('div', { className: 'bo-dep-error' });
    const previewBody = el('tbody');
    const amountId = nextId('bo-dep-pakai');
    const refreshPreview = (): void => {
      errorHost.replaceChildren();
      const rows = previewUse(customer, Math.min(parseMoney(amount.value()), owed));
      previewBody.replaceChildren(
        ...rows.map((row) =>
          el(
            'tr',
            {},
            el('td', {}, el('span', { className: 'bo-dep-name', text: row.id })),
            el('td', { text: formatDate(new Date(row.dueAt)) }),
            el('td', { className: 'bo-dep-num', text: formatRupiah(row.remaining) }),
            el('td', {
              className: 'bo-dep-num bo-dep-in',
              text: row.pay > 0 ? formatRupiah(row.pay) : '-',
            }),
            el('td', { className: 'bo-dep-num', text: formatRupiah(row.after) }),
          ),
        ),
      );
    };
    const amount = createAmountInput(amountId, label('boDepositJumlahPakai'), refreshPreview);
    const useMax = createButton({
      text: label('boDepositPakaiMaks'),
      variant: 'secondary',
      onClick: () => {
        amount.set(usable);
      },
    });
    const save = createButton({
      text: label('boDepositSimpanPakai'),
      variant: 'primary',
      icon: 'check',
      onClick: () => {
        const result = spendDeposit(session, customer.id, amount.value());
        if (!result.ok) {
          errorHost.replaceChildren(createBanner('danger', result.text));
          amount.element.focus();
          return;
        }
        showToast({
          kind: 'success',
          text: label('boDepositPakaiTersimpan', {
            nilai: formatRupiah(result.entry.amount),
            nomor: result.entry.number,
          }),
        });
        refreshAll();
        openDepositReceipt(session, result.entry);
      },
    });
    refreshPreview();
    return el(
      'div',
      { className: 'bo-dep-form' },
      el(
        'div',
        { className: 'field' },
        el('label', {
          className: 'field__label',
          text: label('boDepositJumlahPakai'),
          attrs: { for: amountId },
        }),
        el('div', { className: 'bo-dep-amount' }, amount.element, useMax),
        el('p', {
          className: 'bo-dep-hint',
          text: label('boDepositBatasPakai', { nilai: formatRupiah(usable) }),
        }),
      ),
      el('h3', { className: 'bo-dep-subtitle', text: label('boDepositRincianFaktur') }),
      el(
        'div',
        { className: 'bo-dep-table-wrap' },
        el(
          'table',
          { className: 'pos-table bo-dep-table' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { text: label('boDepositKolomFaktur') }),
              el('th', { text: label('kolomJatuhTempo') }),
              el('th', { className: 'bo-dep-num', text: label('boDepositKolomSisa') }),
              el('th', { className: 'bo-dep-num', text: label('boDepositKolomLunas') }),
              el('th', { className: 'bo-dep-num', text: label('boDepositKolomSetelah') }),
            ),
          ),
          previewBody,
        ),
      ),
      errorHost,
      el('div', { className: 'bo-dep-actions' }, save),
    );
  }

  function renderDetail(): void {
    const customer = selected();
    if (customer === undefined) {
      detail.replaceChildren(
        createEmptyState({
          icon: 'wallet',
          title: label('menuDepositPelanggan'),
          description: label('boDepositPilih'),
        }),
      );
      return;
    }
    const tabs = (['setor', 'pakai'] as const).map((item) => {
      const button = el('button', {
        className: 'bo-dep-seg__item',
        text: label(item === 'setor' ? 'boDepositTabSetor' : 'boDepositTabPakai'),
        attrs: { type: 'button', 'aria-pressed': item === tab ? 'true' : 'false' },
      });
      button.addEventListener('click', () => {
        tab = item;
        renderDetail();
      });
      return button;
    });
    detail.replaceChildren(
      el(
        'div',
        { className: 'bo-dep-person' },
        el(
          'div',
          {},
          el('h2', { className: 'bo-dep-person__name', text: customer.name }),
          el('p', {
            className: 'bo-dep-person__meta',
            text: label('boDepositMeta', {
              kode: customer.code,
              telepon: customer.phone === '' ? '-' : customer.phone,
            }),
          }),
        ),
      ),
      el(
        'div',
        { className: 'bo-dep-tiles' },
        tile(label('boDepositSaldo'), formatRupiah(depositOf(customer)), true),
        tile(label('boDepositPiutang'), formatRupiah(receivableOf(customer))),
        tile(label('boDepositDapatDipakai'), formatRupiah(maxUsable(customer))),
      ),
      el(
        'div',
        {
          className: 'bo-dep-seg',
          attrs: { role: 'group', 'aria-label': label('boDepositTabAria') },
        },
        ...tabs,
      ),
      tab === 'setor' ? topUpForm(customer) : spendForm(customer),
      el('h3', { className: 'bo-dep-subtitle', text: label('boDepositRiwayat') }),
      historyTable(customer),
    );
  }

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderList();
  });

  // Keadaan awal: pelanggan dengan deposit terbesar terpilih.
  selectedId = depositRows(customers(), '', 'bersaldo')[0]?.customer.id;
  refreshAll();

  return {
    element: container,
    destroy: () => {
      // Layar ini tidak memasang pendengar di luar elemennya sendiri.
    },
  };
}
