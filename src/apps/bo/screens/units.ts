import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import {
  factorOf,
  marginPercent,
  parsePrice,
  rowsOf,
  type PriceRow,
  type PricingField,
  type PricingIssue,
} from '../domain/pricing';
import { createProductPicker } from '../picker';
import type { ScreenHandle } from './login';

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

const TIER_FIELDS: readonly (readonly [
  PricingField,
  'tierEceran' | 'tierGrosir' | 'tierKontraktor',
])[] = [
  ['eceran', 'tierEceran'],
  ['grosir', 'tierGrosir'],
  ['kontraktor', 'tierKontraktor'],
];

export function renderUnits(session: BoSession, query: URLSearchParams): ScreenHandle {
  const store = session.store;
  const canEdit = session.allowed('BO-04', 'Simpan Harga');
  let productId: string | undefined;
  let rows: PriceRow[] = [];
  let counter = 0;

  const unitsBox = el('section', { className: 'bo-panel bo-units-table' });
  const pricesBox = el('section', {
    className: 'bo-panel',
    attrs: { tabindex: '0', 'aria-label': label('hargaPerTier') },
  });
  const valueCard = el('section', { className: 'bo-panel bo-value' });
  const error = el('p', { className: 'bo-error', attrs: { role: 'alert' } });
  const info = el('p', { className: 't-label' });
  const product = (): Product | undefined =>
    store.getState().data.products.find((item) => item.id === productId);

  const picker = createProductPicker({
    labelText: label('pilihBarang'),
    products: () => store.getState().data.products,
    onPick: (picked) => {
      load(picked);
    },
  });
  picker.root.classList.add('bo-picker--wide');

  const margins = new Map<string, HTMLElement>();
  const updateMargins = (): void => {
    const current = product();
    for (const row of rows) {
      const node = margins.get(row.key);
      if (node === undefined || current === undefined) {
        continue;
      }
      const margin = marginPercent(parsePrice(row.eceran), current.hpp * factorOf(row));
      node.textContent = margin === undefined ? '-' : `${formatDecimal(margin, 1, 1)}%`;
    }
  };

  const edit = (key: string, field: keyof PriceRow, value: string): void => {
    rows = rows.map((row) => (row.key === key ? { ...row, [field]: value } : row));
    error.textContent = '';
    updateMargins();
  };

  const input = (
    row: PriceRow,
    index: number,
    field: PricingField,
    aria: string,
    editable: boolean,
  ): HTMLElement => {
    if (!canEdit || !editable) {
      return el('span', { text: row[field] === '' ? '-' : row[field] });
    }
    const control = el('input', {
      className: 'input bo-cell-input',
      attrs: {
        'aria-label': aria,
        inputmode: field === 'name' || field === 'barcode' ? undefined : 'decimal',
        autocomplete: 'off',
        'data-cell': `${String(index)}:${field}`,
      },
    });
    control.value = row[field];
    control.addEventListener('input', () => {
      edit(row.key, field, control.value);
      control.removeAttribute('aria-invalid');
    });
    return control;
  };

  const render = (): void => {
    const current = product();
    margins.clear();
    if (current === undefined) {
      unitsBox.replaceChildren(el('p', { className: 't-label', text: label('pilihBarangDulu') }));
      pricesBox.replaceChildren();
      valueCard.replaceChildren();
      return;
    }
    const unitRows = el('tbody');
    const priceRows = el('tbody');
    rows.forEach((row, index) => {
      const unitLabel = row.name === '' ? label('satuanBaru') : row.name;
      unitRows.append(
        el(
          'tr',
          {},
          el(
            'td',
            {},
            input(row, index, 'name', `${label('kolomSatuan')} ${String(index + 1)}`, row.isNew),
            row.isBase
              ? el('span', { className: 't-label', text: ` ${label('dasarTanda')}` })
              : false,
          ),
          el(
            'td',
            { className: 'is-end' },
            row.isBase
              ? el('span', { text: '1' })
              : input(row, index, 'factor', `${label('isiSatuanDasar')} ${unitLabel}`, true),
          ),
          el('td', {}, input(row, index, 'barcode', `${label('barcode')} ${unitLabel}`, true)),
        ),
      );
      const marginNode = el('span', { className: 't-value' });
      margins.set(row.key, marginNode);
      priceRows.append(
        el(
          'tr',
          {},
          el('td', { text: unitLabel }),
          ...TIER_FIELDS.map(([field, key]) =>
            el(
              'td',
              { className: 'is-end' },
              input(row, index, field, `${label(key)} ${unitLabel}`, true),
            ),
          ),
          el('td', { className: 'is-end' }, marginNode),
        ),
      );
    });
    unitsBox.replaceChildren(
      el('h2', { className: 't-section-title', text: label('satuanDanKonversi') }),
      el(
        'table',
        { className: 'pos-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('kolomSatuan') }),
            el('th', { className: 'is-end', text: label('isiSatuanDasar') }),
            el('th', { text: label('barcode') }),
          ),
        ),
        unitRows,
      ),
    );
    pricesBox.replaceChildren(
      el('h2', { className: 't-section-title', text: label('hargaPerTier') }),
      el(
        'table',
        { className: 'pos-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('kolomSatuan') }),
            ...TIER_FIELDS.map(([, key]) => el('th', { className: 'is-end', text: label(key) })),
            el('th', { className: 'is-end', text: label('marginEceran') }),
          ),
        ),
        priceRows,
      ),
    );
    const display = current.stock.display * current.hpp;
    const besar = current.stock.besar * current.hpp;
    valueCard.replaceChildren(
      el('h2', { className: 't-section-title', text: label('nilaiPersediaan') }),
      el(
        'p',
        {},
        el('span', {
          className: 't-label',
          text: `${label('hppPerSatuanDasar')} (${current.baseUnit})`,
        }),
        el('output', { className: 't-value', text: formatRupiah(current.hpp) }),
      ),
      el(
        'p',
        {},
        el('span', { className: 't-label', text: label('nilaiDisplay') }),
        el('output', { className: 't-value', text: formatRupiah(display) }),
      ),
      el(
        'p',
        {},
        el('span', { className: 't-label', text: label('nilaiBesar') }),
        el('output', { className: 't-value', text: formatRupiah(besar) }),
      ),
      el(
        'p',
        {},
        el('span', { className: 't-label', text: label('nilaiTotal') }),
        el('output', { className: 't-total', text: formatRupiah(display + besar) }),
      ),
    );
    info.textContent = canEdit ? '' : label('hanyaBaca');
    updateMargins();
  };

  function load(target: Product | undefined): void {
    productId = target?.id;
    rows = target === undefined ? [] : rowsOf(target);
    error.textContent = '';
    render();
  }

  const showIssue = (issue: PricingIssue): void => {
    error.textContent = 'messageId' in issue ? message(issue.messageId) : label(issue.labelKey);
    const target = document.querySelector<HTMLElement>(
      `[data-cell="${String(issue.row)}:${issue.field}"]`,
    );
    target?.setAttribute('aria-invalid', 'true');
    target?.focus();
  };

  const doSave = (confirmed: boolean): void => {
    const current = product();
    if (current === undefined) {
      return;
    }
    const result = session.savePricing(current.id, rows, confirmed);
    if (result.ok) {
      showToast({ kind: 'success', text: label('hargaTersimpan') });
      load(product());
      return;
    }
    if (result.kind === 'issue') {
      showIssue(result.issue);
    } else if (result.kind === 'confirm') {
      openModal({
        title: label('hargaDiBawahHpp'),
        body: message('MSG-068'),
        actions: [
          { text: label('batal'), variant: 'secondary' },
          {
            text: label('simpanTetap'),
            variant: 'primary',
            onClick: () => {
              doSave(true);
            },
          },
        ],
      });
    } else {
      showToast({ kind: 'error', text: message(result.messageId) });
    }
  };

  const save = createButton({
    text: label('simpanHarga'),
    icon: 'save',
    onClick: () => {
      if (!store.getState().online) {
        return;
      }
      doSave(false);
    },
  });
  const add = createButton({
    text: label('tambahSatuan'),
    variant: 'secondary',
    onClick: () => {
      counter += 1;
      rows = [
        ...rows,
        {
          key: `n${String(counter)}`,
          code: '',
          name: '',
          factor: '',
          barcode: '',
          eceran: '',
          grosir: '',
          kontraktor: '',
          isBase: false,
          isNew: true,
        },
      ];
      render();
      document.querySelector<HTMLElement>(`[data-cell="${String(rows.length - 1)}:name"]`)?.focus();
    },
  });
  const cancel = createButton({
    text: label('batal'),
    variant: 'secondary',
    onClick: () => {
      load(product());
    },
  });

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      cancel.click();
    } else if (isPc() && canEdit && event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save.click();
    } else if (isPc() && canEdit && event.ctrlKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      add.click();
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
    { className: 'bo-units-page' },
    picker.root,
    info,
    el('div', { className: 'bo-units-page__top' }, unitsBox, valueCard),
    pricesBox,
    error,
    el('div', { className: 'bo-form__actions' }, ...(canEdit ? [add, cancel, save] : [cancel])),
  );
  const wanted = query.get('barang');
  const initial =
    wanted === null
      ? store.getState().data.products[0]
      : store.getState().data.products.find((item) => item.code === wanted);
  load(initial);
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
