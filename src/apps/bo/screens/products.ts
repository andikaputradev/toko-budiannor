import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import { totalStock } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { createVirtualGrid } from '../../../shared/ui/virtual-grid';
import type { BoSession } from '../bo-session';
import {
  BASE_UNITS,
  CODE_MAX,
  draftOf,
  emptyDraft,
  type ProductDraft,
} from '../domain/product-form';
import { findProducts } from '../search';
import type { ScreenHandle } from './login';

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function renderProducts(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  let query = '';
  let selectedId: string | undefined;
  let isNew = false;
  let photo = { name: '', bytes: 0 };

  const search = el('input', {
    className: 'input bo-search',
    attrs: { type: 'search', autocomplete: 'off', 'aria-label': label('cari') },
  });
  const count = el('p', { className: 't-label bo-count', attrs: { 'aria-live': 'polite' } });
  const empty = el('div', { className: 'bo-empty' });

  const code = createTextField({ labelText: label('kodeBarang') });
  const barcode = createTextField({ labelText: label('barcode'), inputMode: 'numeric' });
  const name = createTextField({ labelText: label('namaBarang') });
  const brand = createTextField({ labelText: label('merek') });
  const category = createTextField({ labelText: label('kategori') });
  code.input.maxLength = CODE_MAX;
  const baseUnit = createSelectField({
    labelText: label('satuanDasar'),
    options: [
      { value: '', text: label('pilihSatuanDasar') },
      ...BASE_UNITS.map((unit) => ({ value: unit, text: unit })),
    ],
  });
  const fraction = createSelectField({
    labelText: label('bolehPecahan'),
    options: [
      { value: 'ya', text: label('ya') },
      { value: 'tidak', text: label('tidak') },
    ],
  });
  const defaultUnit = createSelectField({
    labelText: label('satuanJualBawaan'),
    options: [{ value: '', text: label('satuanDasar') }],
  });
  const minDisplay = createTextField({ labelText: label('stokMinDisplay'), inputMode: 'decimal' });
  const minBesar = createTextField({ labelText: label('stokMinBesar'), inputMode: 'decimal' });
  const photoId = nextId('foto');
  const photoInput = el('input', {
    className: 'input',
    attrs: { id: photoId, type: 'file', accept: 'image/*' },
  });
  const photoError = el('p', { className: 'bo-error', attrs: { role: 'alert' } });
  const photoName = el('p', { className: 't-label' });
  const hppOutput = el('output', { className: 't-value' });
  const stockOutput = el('output', { className: 't-value' });
  const unitsOutput = el('ul', { className: 'bo-units' });
  const statusOutput = el('output', { className: 't-label' });

  const products = (): readonly Product[] => store.getState().data.products;
  const rows = (): readonly Product[] => findProducts(products(), query, products().length);
  const productById = (id: string | undefined): Product | undefined =>
    products().find((item) => item.id === id);

  const readDraft = (): ProductDraft => ({
    code: code.input.value,
    barcode: barcode.input.value,
    name: name.input.value,
    brand: brand.input.value,
    category: category.input.value,
    baseUnit: baseUnit.select.value,
    allowDecimal: fraction.select.value === 'ya',
    defaultUnit: defaultUnit.select.value,
    minDisplay: minDisplay.input.value,
    minBesar: minBesar.input.value,
    photoName: photo.name,
    photoBytes: photo.bytes,
  });

  const fillUnits = (product: Product | undefined, base: string): void => {
    const codes = product === undefined ? [base] : product.units.map((unit) => unit.code);
    defaultUnit.select.replaceChildren(
      ...codes
        .filter((value) => value !== '')
        .map((value) => el('option', { text: value, attrs: { value } })),
    );
  };

  const fillForm = (product: Product | undefined): void => {
    for (const field of [code, name, minDisplay]) {
      field.setError(undefined);
    }
    photoError.textContent = '';
    const draft = product === undefined ? emptyDraft() : draftOf(product);
    code.input.value = draft.code;
    barcode.input.value = draft.barcode;
    name.input.value = draft.name;
    brand.input.value = draft.brand;
    category.input.value = draft.category;
    baseUnit.select.value = draft.baseUnit;
    baseUnit.select.disabled = product !== undefined;
    fraction.select.value = draft.allowDecimal ? 'ya' : 'tidak';
    fillUnits(product, draft.baseUnit);
    defaultUnit.select.value = draft.defaultUnit;
    minDisplay.input.value = draft.minDisplay;
    minBesar.input.value = draft.minBesar;
    photo = { name: draft.photoName, bytes: 0 };
    photoInput.value = '';
    photoName.textContent = draft.photoName === '' ? label('fotoProduk') : draft.photoName;
    const canSeeCost = session.allowed('BO-03', 'Tambah Barang');
    hppOutput.textContent = canSeeCost && product !== undefined ? formatRupiah(product.hpp) : '-';
    stockOutput.textContent =
      product === undefined
        ? '-'
        : `${label('stokDisplay')} ${formatDecimal(product.stock.display, 3, 1)}, ${label('stokBesar')} ${formatDecimal(product.stock.besar, 3, 1)}`;
    unitsOutput.replaceChildren(
      ...(product?.units ?? []).map((unit) => {
        const prices = product?.prices[unit.code];
        return el('li', {
          text: `${unit.name}${unit.factor === 1 ? ` ${label('dasarTanda')}` : ''}: ${prices === undefined ? '-' : formatRupiah(prices.eceran)}`,
        });
      }),
    );
    statusOutput.textContent =
      product === undefined ? '' : label(product.active === false ? 'nonaktif' : 'aktif');
    deactivate.toggleAttribute(
      'hidden',
      product === undefined ||
        product.active === false ||
        !session.allowed('BO-03', 'Nonaktifkan Barang'),
    );
    pricesLink.toggleAttribute('hidden', product === undefined);
  };

  const grid = createVirtualGrid<Product>({
    label: label('daftarBarang'),
    rows: rows(),
    rowKey: (product) => product.id,
    columns: [
      { header: label('kolomKode'), width: '96px', cell: (product) => product.code },
      {
        header: label('kolomNamaBarang'),
        width: '1fr',
        cell: (product) =>
          product.active === false ? `${product.name} (${label('nonaktif')})` : product.name,
      },
      { header: label('kolomKategori'), width: '130px', cell: (product) => product.category },
      { header: label('kolomSatuanDasar'), width: '80px', cell: (product) => product.baseUnit },
      {
        header: label('kolomStok'),
        width: '90px',
        align: 'end',
        cell: (product) => formatDecimal(totalStock(product), 3, 1),
      },
      {
        header: label('kolomMin'),
        width: '70px',
        align: 'end',
        cell: (product) => formatDecimal(product.minStock, 3, 1),
      },
    ],
    onSelect: (product) => {
      selectedId = product.id;
      isNew = false;
      fillForm(product);
    },
  });

  const refreshList = (): void => {
    const list = rows();
    grid.setRows(list);
    count.textContent = label('jumlahBarangDaftar', { jumlah: formatDecimal(list.length) });
    empty.replaceChildren(
      ...(list.length === 0
        ? [createEmptyState({ icon: 'inbox', title: label('barangKosong') })]
        : []),
    );
  };

  const showIssue = (issue: { field: string; messageId: string | undefined }): void => {
    const text =
      issue.messageId === undefined
        ? label('kodeBarangPanjang')
        : message(issue.messageId as 'MSG-058');
    const target =
      issue.field === 'code' || issue.field === 'codeLength'
        ? code
        : issue.field === 'name'
          ? name
          : issue.field === 'minStock'
            ? minDisplay
            : undefined;
    if (target !== undefined) {
      target.setError(text);
      target.input.focus();
      return;
    }
    if (issue.field === 'baseUnit') {
      baseUnit.select.focus();
      photoError.textContent = text;
      return;
    }
    photoError.textContent = text;
  };

  const save = createButton({
    text: label('simpanBarang'),
    icon: 'save',
    onClick: () => {
      if (!store.getState().online) {
        return;
      }
      for (const field of [code, name, minDisplay]) {
        field.setError(undefined);
      }
      photoError.textContent = '';
      const result = session.saveProduct(readDraft(), isNew ? undefined : selectedId);
      if (result.ok) {
        showToast({ kind: 'success', text: message('MSG-011') });
        selectedId = result.product.id;
        isNew = false;
        query = '';
        search.value = '';
        refreshList();
        const index = rows().findIndex((item) => item.id === result.product.id);
        grid.select(index);
        return;
      }
      if ('issue' in result) {
        showIssue(result.issue);
      } else {
        showToast({ kind: 'error', text: message(result.messageId) });
      }
    },
  });
  const addNew = createButton({
    text: label('tambahBarang'),
    onClick: () => {
      isNew = true;
      selectedId = undefined;
      fillForm(undefined);
      code.input.focus();
    },
  });
  const deactivate = createButton({
    text: label('nonaktifkanBarang'),
    variant: 'danger',
    onClick: () => {
      const target = productById(selectedId);
      if (target === undefined) {
        return;
      }
      openModal({
        title: label('nonaktifkanBarang'),
        body: label('nonaktifkanTeks', { kode: target.code }),
        actions: [
          { text: label('batal'), variant: 'secondary' },
          {
            text: label('nonaktifkan'),
            variant: 'danger',
            onClick: () => {
              session.deactivateProduct(target.id);
              refreshList();
              fillForm(productById(target.id));
            },
          },
        ],
      });
    },
  });
  const pricesLink = createButton({
    text: label('menuHarga'),
    variant: 'secondary',
    onClick: () => {
      const target = productById(selectedId);
      go(`/bo/harga?barang=${encodeURIComponent(target?.code ?? '')}`);
    },
  });

  photoInput.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    photo = file === undefined ? { name: '', bytes: 0 } : { name: file.name, bytes: file.size };
    photoName.textContent = photo.name === '' ? label('fotoProduk') : photo.name;
    photoError.textContent = '';
  });
  search.addEventListener('input', () => {
    query = search.value;
    refreshList();
  });
  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null || !isPc()) {
      return;
    }
    if (event.key === '/' && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      search.focus();
    } else if (event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save.click();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      addNew.click();
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = store.subscribe(() => {
    const online = store.getState().online;
    save.toggleAttribute('data-inactive', !online);
    save.setAttribute('aria-disabled', online ? 'false' : 'true');
  });

  const form = el(
    'section',
    { className: 'bo-panel bo-form', attrs: { 'aria-label': label('formBarang') } },
    el('h2', { className: 't-section-title', text: label('formBarang') }),
    el(
      'div',
      { className: 'bo-form__grid' },
      code.root,
      barcode.root,
      el('div', { className: 'bo-form__wide' }, name.root),
      brand.root,
      category.root,
      baseUnit.root,
      fraction.root,
      defaultUnit.root,
      minDisplay.root,
      minBesar.root,
      el(
        'div',
        { className: 'field bo-form__wide' },
        el('label', {
          className: 'field__label',
          text: label('fotoProduk'),
          attrs: { for: photoId },
        }),
        photoInput,
        photoName,
        photoError,
      ),
      el(
        'div',
        { className: 'field' },
        el('span', { className: 'field__label', text: label('hppRataRata') }),
        hppOutput,
      ),
      el(
        'div',
        { className: 'field' },
        el('span', { className: 'field__label', text: label('stokPerGudang') }),
        stockOutput,
      ),
      el(
        'div',
        { className: 'field bo-form__wide' },
        el('span', { className: 'field__label', text: label('satuanDanHarga') }),
        unitsOutput,
        statusOutput,
      ),
    ),
    el('div', { className: 'bo-form__actions' }, deactivate, pricesLink, save),
  );

  const element = el(
    'div',
    { className: 'bo-split' },
    el(
      'section',
      { className: 'bo-split__main' },
      el('div', { className: 'bo-bar' }, search, addNew),
      count,
      grid.element,
      empty,
    ),
    form,
  );
  refreshList();
  const first = rows()[0];
  if (first !== undefined) {
    selectedId = first.id;
    fillForm(first);
  }
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
