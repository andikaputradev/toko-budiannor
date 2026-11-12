import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import type { Product } from '../../../shared/data/types';

export interface SelectedBarcodeItem {
  readonly product: Product;
  copies: number;
  selected: boolean;
}

export function renderBarcodeScreen(session: BoSession, go: (path: string) => void): ScreenHandle {
  const dataset = session.store.getState().data;
  const products = dataset.products;

  let labelFormat: 'barcode-produk' | 'label-rak' | 'a4-sheet' = 'barcode-produk';
  let searchQuery = '';

  const itemsMap = new Map<string, SelectedBarcodeItem>(
    products.slice(0, 30).map((p, idx) => [
      p.id,
      {
        product: p,
        copies: idx < 5 ? 2 : 1,
        selected: idx < 8,
      },
    ]),
  );

  const container = el('div', { className: 'bo-form-page' });

  // Top Bar
  const subtitle = 'Cetak label barcode kemasan dan label harga rak display toko berbagai ukuran';
  const titleBlock = el(
    'div',
    {},
    el('h1', { className: 'bo-page-title', text: 'Cetak Barcode Massal & Label Rak' }),
    el('p', { className: 't-label bo-acc-sub', attrs: { title: subtitle }, text: subtitle }),
  );

  // Format Switcher
  const btnFormatBarcode = el('button', {
    className: 'bo-tab-btn is-active',
    attrs: { type: 'button' },
    text: 'Label Barcode (33x15 mm)',
  });

  const btnFormatRak = el('button', {
    className: 'bo-tab-btn',
    attrs: { type: 'button' },
    text: 'Label Harga Rak (70x35 mm)',
  });

  const btnFormatA4 = el('button', {
    className: 'bo-tab-btn',
    attrs: { type: 'button' },
    text: 'Lembar A4 (Tom & Jerry)',
  });

  const formatSwitcher = el(
    'div',
    { className: 'bo-tab-switcher' },
    btnFormatBarcode,
    btnFormatRak,
    btnFormatA4,
  );

  const btnBack = createButton({
    text: label('kembaliKeDashboard'),
    variant: 'secondary',
    onClick: () => {
      go('/bo/dashboard');
    },
  });

  const btnCetak = createButton({
    text: 'Cetak Label Terpilih',
    variant: 'primary',
    icon: 'printer',
    onClick: handleOpenPrintPreview,
  });

  const topBar = el(
    'div',
    { className: 'bo-toolbar' },
    el('div', { className: 'bo-toolbar__left bo-acc-toolbar-left' }, titleBlock, formatSwitcher),
    el('div', { className: 'bo-toolbar__right' }, btnBack, btnCetak),
  );

  // Filter Bar
  const searchInput = el('input', {
    className: 'input is-search',
    attrs: { type: 'search', placeholder: 'Cari nama barang, kode, barcode...' },
  });

  const btnPilihSemua = createButton({
    text: 'Pilih Semua',
    variant: 'secondary',
    onClick: () => {
      for (const item of itemsMap.values()) {
        item.selected = true;
      }
      refreshTable();
      refreshPreview();
    },
  });

  const btnBatalPilih = createButton({
    text: 'Batal Pilih',
    variant: 'secondary',
    onClick: () => {
      for (const item of itemsMap.values()) {
        item.selected = false;
      }
      refreshTable();
      refreshPreview();
    },
  });

  const filterBar = el(
    'div',
    { className: 'bo-panel bo-filter-bar' },
    el('div', { className: 'bo-acc-filter__search' }, searchInput),
    btnPilihSemua,
    btnBatalPilih,
  );

  // Table
  const tableTbody = el('tbody', {});
  const previewContainer = el('div', { className: 'bo-barcode-preview-grid' });

  function refreshTable(): void {
    tableTbody.replaceChildren();

    const q = searchQuery.toLowerCase();
    const filtered = [...itemsMap.values()].filter(
      (it) =>
        it.product.name.toLowerCase().includes(q) ||
        it.product.code.toLowerCase().includes(q) ||
        it.product.barcode.includes(q),
    );

    if (filtered.length === 0) {
      tableTbody.appendChild(
        el(
          'tr',
          {},
          el('td', {
            attrs: { colspan: '7' },
            className: 'bo-empty-cell',
            text: 'Tidak ada barang yang cocok.',
          }),
        ),
      );
      return;
    }

    filtered.forEach((it) => {
      const chk = el('input', {
        attrs: { type: 'checkbox' },
      });
      chk.checked = it.selected;
      chk.addEventListener('change', () => {
        it.selected = chk.checked;
        refreshPreview();
      });

      const copyInput = el('input', {
        className: 'input is-sm is-num bo-copies-input',
        attrs: {
          type: 'number',
          min: '1',
          max: '100',
          value: String(it.copies),
        },
      });
      copyInput.addEventListener('input', () => {
        it.copies = Math.max(1, parseInt(copyInput.value, 10) || 1);
        refreshPreview();
      });

      const baseUnit = it.product.baseUnit;
      const prices = it.product.prices[baseUnit] ?? { eceran: 0, grosir: 0 };

      tableTbody.appendChild(
        el(
          'tr',
          { className: it.selected ? 'bo-row-selected' : '' },
          el('td', { className: 'is-center' }, chk),
          el('td', {}, el('strong', { className: 'bo-text-primary', text: it.product.code })),
          el('td', { text: it.product.barcode !== '' ? it.product.barcode : it.product.code }),
          el(
            'td',
            {},
            el('div', { text: it.product.name }),
            el('span', { className: 't-label', text: it.product.category }),
          ),
          el('td', { text: baseUnit }),
          el(
            'td',
            { className: 'is-end' },
            el('div', { text: formatRupiah(prices.eceran) }),
            el('span', { className: 't-label', text: `Grosir: ${formatRupiah(prices.grosir)}` }),
          ),
          el('td', { className: 'is-center' }, copyInput),
        ),
      );
    });
  }

  function refreshPreview(): void {
    previewContainer.replaceChildren();
    const selectedItems = [...itemsMap.values()].filter((it) => it.selected);

    if (selectedItems.length === 0) {
      previewContainer.appendChild(
        el('p', {
          className: 't-label bo-preview-empty',
          text: 'Pilih barang pada tabel di atas untuk melihat pratinjau label barcode.',
        }),
      );
      return;
    }

    selectedItems.forEach((it) => {
      const baseUnit = it.product.baseUnit || 'PCS';
      const prices = it.product.prices[baseUnit] ?? { eceran: 0, grosir: 0 };

      for (let i = 0; i < Math.min(it.copies, 2); i++) {
        if (labelFormat === 'label-rak') {
          // Label Rak Display (Besar)
          const rakCard = el(
            'div',
            { className: 'bo-shelf-label' },
            el(
              'div',
              { className: 'bo-shelf-label__header' },
              el('span', { text: 'TOKO BUDIANNOR' }),
              el('span', { text: it.product.category }),
            ),
            el('div', { className: 'bo-shelf-label__name', text: it.product.name }),
            el(
              'div',
              { className: 'bo-shelf-label__price-row' },
              el(
                'div',
                {},
                el('span', { className: 't-label', text: 'ECERAN' }),
                el('div', {
                  className: 'bo-shelf-label__price',
                  text: formatRupiah(prices.eceran),
                }),
              ),
              el(
                'div',
                { className: 'bo-shelf-label__right' },
                el('span', { className: 't-label', text: 'GROSIR' }),
                el('div', {
                  className: 'bo-shelf-label__wholesale',
                  text: formatRupiah(prices.grosir),
                }),
              ),
            ),
            el(
              'div',
              { className: 'bo-shelf-label__barcode-row' },
              createFakeBarcodeSvg(
                it.product.barcode !== '' ? it.product.barcode : it.product.code,
              ),
              el('span', { className: 'bo-shelf-label__code', text: it.product.code }),
            ),
          );
          previewContainer.appendChild(rakCard);
        } else {
          // Label Barcode Produk (Kecil)
          const prodCard = el(
            'div',
            { className: 'bo-prod-barcode-label' },
            el('div', { className: 'bo-barcode-store', text: 'TOKO BUDIANNOR' }),
            el('div', { className: 'bo-barcode-name', text: it.product.name }),
            createFakeBarcodeSvg(it.product.barcode || it.product.code),
            el(
              'div',
              { className: 'bo-barcode-price-row' },
              el('span', { text: it.product.barcode || it.product.code }),
              el('strong', { text: formatRupiah(prices.eceran) }),
            ),
          );
          previewContainer.appendChild(prodCard);
        }
      }
    });
  }

  function createFakeBarcodeSvg(code: string): HTMLElement {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '110');
    svg.setAttribute('height', '28');
    const seed = code.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    for (let i = 0; i < 36; i++) {
      const isBlack = (seed * (i + 3) + i * 7) % 3 !== 0;
      const width = (seed + i) % 2 === 0 ? 2 : 1;
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(i * 3));
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(width));
      rect.setAttribute('height', '28');
      rect.setAttribute('fill', isBlack ? '#000' : '#fff');
      svg.appendChild(rect);
    }
    const svgWrapper = el('div', { className: 'bo-barcode-svg' });
    svgWrapper.appendChild(svg);
    return svgWrapper;
  }

  function handleOpenPrintPreview(): void {
    const selected = [...itemsMap.values()].filter((it) => it.selected);
    if (selected.length === 0) {
      showToast({ kind: 'info', text: 'Pilih minimal satu barang untuk dicetak.' });
      return;
    }

    const totalLabels = selected.reduce((s, it) => s + it.copies, 0);
    const labelCards = selected.slice(0, 12).map((it) => {
      const price = it.product.prices[it.product.baseUnit || 'PCS']?.eceran ?? 0;
      return el(
        'div',
        { className: 'bo-print-card' },
        el('div', { className: 'bo-print-card__brand', text: 'TOKO BUDIANNOR' }),
        el('div', { className: 'bo-print-card__name', text: it.product.name }),
        el('div', { className: 'bo-print-card__bars' }),
        el('div', { className: 'bo-print-card__price', text: formatRupiah(price) }),
      );
    });

    const modalBody = el(
      'div',
      { className: 'bo-print-modal-content' },
      el(
        'div',
        { className: 'bo-print-head' },
        el('h3', { className: 'bo-print-head__title', text: 'LEMBAR CETAK LABEL BARCODE' }),
        el('p', {
          className: 'bo-print-head__meta',
          text: `Format: ${labelFormat.toUpperCase()} | Total ${String(totalLabels)} Label Siap Dicetak`,
        }),
      ),
      el(
        'div',
        { className: 'bo-print-box' },
        el('p', {
          className: 'bo-print-box__warn',
          text: 'Perhatian: Pastikan printer barcode / thermal label telah terpasang dan kertas stiker terkalibrasi dengan benar.',
        }),
        el('div', { className: 'bo-print-box__cards' }, ...labelCards),
        selected.length > 12
          ? el('p', {
              className: 'bo-print-box__more',
              text: `...dan ${String(selected.length - 12)} barang lainnya`,
            })
          : el('span'),
      ),
    );

    openModal({
      title: 'Pratinjau Cetak Barcode',
      body: modalBody,
      actions: [
        {
          text: 'Cetak ke Printer',
          variant: 'primary',
          icon: 'printer',
          onClick: () => {
            window.print();
            showToast({
              kind: 'success',
              text: `${String(totalLabels)} label dikirim ke printer.`,
            });
          },
        },
        { text: label('tutup'), variant: 'secondary' },
      ],
    });
  }

  // Event Handlers
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    refreshTable();
  });

  btnFormatBarcode.addEventListener('click', () => {
    labelFormat = 'barcode-produk';
    btnFormatBarcode.classList.add('is-active');
    btnFormatRak.classList.remove('is-active');
    btnFormatA4.classList.remove('is-active');
    refreshPreview();
  });

  btnFormatRak.addEventListener('click', () => {
    labelFormat = 'label-rak';
    btnFormatRak.classList.add('is-active');
    btnFormatBarcode.classList.remove('is-active');
    btnFormatA4.classList.remove('is-active');
    refreshPreview();
  });

  btnFormatA4.addEventListener('click', () => {
    labelFormat = 'a4-sheet';
    btnFormatA4.classList.add('is-active');
    btnFormatBarcode.classList.remove('is-active');
    btnFormatRak.classList.remove('is-active');
    refreshPreview();
  });

  // Initial
  refreshTable();
  refreshPreview();

  const previewPanel = el(
    'div',
    { className: 'bo-panel bo-barcode-preview-panel' },
    el('h3', { className: 'bo-form-sec-title', text: 'Pratinjau Label Siap Cetak' }),
    previewContainer,
  );

  const tablePanel = el(
    'div',
    { className: 'bo-panel' },
    el(
      'table',
      { className: 'pos-table is-compact' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { className: 'is-center', text: 'Pilih' }),
          el('th', { text: 'Kode' }),
          el('th', { text: 'Barcode' }),
          el('th', { text: 'Nama Barang' }),
          el('th', { text: 'Satuan' }),
          el('th', { className: 'is-end', text: 'Harga Jual' }),
          el('th', { className: 'is-center', text: 'Jumlah Cetak' }),
        ),
      ),
      tableTbody,
    ),
  );

  container.appendChild(topBar);
  container.appendChild(filterBar);
  container.appendChild(tablePanel);
  container.appendChild(previewPanel);

  return {
    element: container,
    destroy: () => undefined,
  };
}
