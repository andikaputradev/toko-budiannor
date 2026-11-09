import { el } from '../../../shared/dom';
import { formatDecimal } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  createDefaultExpeditionFromInvoice,
  addKoliPackage,
  type ExpeditionNote,
  type KoliPackage,
} from '../domain/expedition';
import { createSalesInvoiceDraft } from '../domain/sales-transaction';

export function renderExpeditionForm(
  session: BoSession,
  go: (path: string) => void,
  invoiceNumber?: string,
): ScreenHandle {
  const store = session.store;
  // Kamus memuat tanda plus di awal; tombol sudah punya ikon plus sendiri.
  const addKoliText = label('tombolTambahKoli').replace(/^\+\s*/, '');
  const dataset = store.getState().data;

  // Siapkan draft faktur dasar untuk referensi ekspedisi
  const salesDraft = createSalesInvoiceDraft(dataset);
  let expeditionNote: ExpeditionNote = createDefaultExpeditionFromInvoice({
    ...salesDraft,
    invoiceNumber: invoiceNumber ?? salesDraft.invoiceNumber,
    customerName: 'Bu Sherly Tjoandra',
    customerAddress: 'Jl. Rajawali No 17',
    customerPhone: '0811230988',
    expedition: 'JNE Cargo',
    lines: [
      {
        id: '1',
        productId: 'P-01',
        productName: 'Kuas Roll 9 Inch',
        aliasName: '',
        warehouse: 'toko',
        unit: 'PCS',
        quantity: 10,
        unitPrice: 25000,
        discountExpr: '',
      },
      {
        id: '2',
        productId: 'P-02',
        productName: 'Obeng Bolak Balik Magnet',
        aliasName: '',
        warehouse: 'toko',
        unit: 'PCS',
        quantity: 6,
        unitPrice: 35000,
        discountExpr: '',
      },
      {
        id: '3',
        productId: 'P-03',
        productName: 'Engsel Pintu Bellucci SN5',
        aliasName: '',
        warehouse: 'toko',
        unit: 'PASANG',
        quantity: 12,
        unitPrice: 45000,
        discountExpr: '',
      },
    ],
  });

  const container = el('div', { className: 'bo-form-page' });

  // Inputs
  const sjNumberEl = el('input', {
    className: 'input is-readonly',
    attrs: { type: 'text', readonly: 'true', value: expeditionNote.noteNumber },
  });
  const invNumberEl = el('input', {
    className: 'input is-readonly',
    attrs: { type: 'text', readonly: 'true', value: expeditionNote.invoiceNumber },
  });
  const dateEl = el('input', {
    className: 'input',
    attrs: { type: 'date', value: expeditionNote.date },
  });
  const expeditionNameEl = el('input', {
    className: 'input',
    attrs: { type: 'text', value: expeditionNote.expeditionName },
  });
  const driverEl = el('input', {
    className: 'input',
    attrs: { type: 'text', value: `${expeditionNote.driverName} (${expeditionNote.vehiclePlate})` },
  });
  const recipientEl = el('input', {
    className: 'input',
    attrs: {
      type: 'text',
      value: `${expeditionNote.recipientName} - ${expeditionNote.destinationAddress} (${expeditionNote.recipientPhone})`,
    },
  });

  const koliContainerEl = el('div', { className: 'bo-koli-container' });
  const totalKoliBadgeEl = el('span', { className: 'bo-stat-pill is-primary', text: '1 Koli' });
  const totalWeightBadgeEl = el('span', { className: 'bo-stat-pill is-info', text: '0 Kg' });

  function renderKoliList(): void {
    koliContainerEl.replaceChildren();

    expeditionNote.koliList.forEach((koli) => {
      const itemsTable = el(
        'table',
        { className: 'pos-table is-compact' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('namaBarang') }),
            el('th', { text: label('satuanDasar') }),
            el('th', { className: 'is-end', text: label('kolomKuantitas') }),
          ),
        ),
        el(
          'tbody',
          {},
          ...koli.items.map((it) =>
            el(
              'tr',
              {},
              el('td', { text: it.name }),
              el('td', { text: it.unit }),
              el('td', { className: 'is-end is-bold', text: formatDecimal(it.quantity) }),
            ),
          ),
        ),
      );

      const koliCard = el(
        'div',
        { className: 'bo-panel bo-koli-card' },
        el(
          'div',
          { className: 'bo-koli-card__header' },
          el(
            'div',
            { className: 'bo-koli-card__title' },
            el('span', { className: 'bo-badge is-toko', text: `Koli #${koli.koliIndex}` }),
            el('strong', { text: koli.title }),
          ),
          el(
            'div',
            { className: 'bo-koli-card__meta' },
            el('span', { className: 't-label', text: `Kemasan: ${koli.packageType}` }),
            el('span', { className: 'bo-badge is-disc', text: `${koli.weightKg} Kg` }),
          ),
        ),
        itemsTable,
      );

      koliContainerEl.appendChild(koliCard);
    });

    totalKoliBadgeEl.textContent = `${expeditionNote.totalKoli} Koli`;
    totalWeightBadgeEl.textContent = `${expeditionNote.totalWeightKg} Kg`;
  }

  function openAddKoliModal(): void {
    const titleInput = el('input', {
      className: 'input',
      attrs: { type: 'text', placeholder: 'Contoh: Barang Campur (Kuas/Obeng)' },
    });
    const typeSelect = el('select', { className: 'input is-select' });
    ['Dus Karton', 'Karung Goni', 'Ikat / Bundel', 'Palet Kayu'].forEach((t) => {
      typeSelect.appendChild(el('option', { text: t, attrs: { value: t } }));
    });
    const weightInput = el('input', {
      className: 'input',
      attrs: { type: 'number', min: '1', value: '10' },
    });
    const itemNameInput = el('input', {
      className: 'input',
      attrs: { type: 'text', placeholder: 'Nama Barang' },
    });
    const itemQtyInput = el('input', {
      className: 'input',
      attrs: { type: 'number', min: '1', value: '1' },
    });
    const itemUnitInput = el('input', {
      className: 'input',
      attrs: { type: 'text', value: 'PCS' },
    });

    const modalBody = el(
      'div',
      { className: 'bo-dialog-form' },
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Judul / Label Koli' }),
        titleInput,
      ),
      el(
        'div',
        { className: 'bo-form-row-2' },
        el(
          'div',
          { className: 'field' },
          el('label', { className: 'field__label', text: 'Jenis Kemasan' }),
          typeSelect,
        ),
        el(
          'div',
          { className: 'field' },
          el('label', { className: 'field__label', text: 'Estimasi Berat (Kg)' }),
          weightInput,
        ),
      ),
      el('h4', { className: 'bo-modal-sec-title', text: 'Item Utama Koli' }),
      el(
        'div',
        { className: 'bo-form-row-2' },
        el(
          'div',
          { className: 'field' },
          el('label', { className: 'field__label', text: 'Nama Barang' }),
          itemNameInput,
        ),
        el(
          'div',
          { className: 'field' },
          el('label', { className: 'field__label', text: 'Qty' }),
          itemQtyInput,
        ),
      ),
    );

    openModal({
      title: addKoliText,
      body: modalBody,
      actions: [
        {
          text: 'Tambahkan ke Packing List',
          variant: 'primary',
          onClick: () => {
            const nextIdx = expeditionNote.koliList.length + 1;
            const newKoli: KoliPackage = {
              koliIndex: nextIdx,
              packageType: typeSelect.value,
              title: titleInput.value.trim() || `Koli #${nextIdx}`,
              weightKg: parseFloat(weightInput.value) || 10,
              items: [
                {
                  name: itemNameInput.value.trim() || 'Barang Campur Logistik',
                  quantity: parseFloat(itemQtyInput.value) || 1,
                  unit: itemUnitInput.value.trim() || 'PCS',
                },
              ],
            };
            expeditionNote = addKoliPackage(expeditionNote, newKoli);
            renderKoliList();
            showToast({ kind: 'success', text: `Koli #${nextIdx} berhasil ditambahkan.` });
          },
        },
        { text: label('batal'), variant: 'secondary' },
      ],
    });
  }

  function printOfficialSuratJalan(): void {
    window.print();
  }

  // Action Buttons
  const btnTambahKoli = createButton({
    text: addKoliText,
    variant: 'secondary',
    icon: 'plus',
    onClick: openAddKoliModal,
  });

  const btnCetak = createButton({
    text: 'Cetak Surat Jalan',
    variant: 'primary',
    icon: 'printer',
    onClick: printOfficialSuratJalan,
  });

  const btnKembali = createButton({
    text: 'Kembali Ke Penjualan',
    variant: 'secondary',
    icon: 'arrow-left',
    onClick: () => {
      go('/bo/penjualan');
    },
  });

  const topBar = el(
    'div',
    { className: 'bo-toolbar' },
    el(
      'div',
      { className: 'bo-toolbar__left' },
      el('h1', { className: 'bo-page-title', text: label('suratJalanJudul') }),
      el('div', { className: 'bo-summary-pills' }, totalKoliBadgeEl, totalWeightBadgeEl),
    ),
    el('div', { className: 'bo-toolbar__right' }, btnTambahKoli, btnCetak, btnKembali),
  );

  // Metadata Card
  const metaCard = el(
    'div',
    { className: 'bo-panel bo-form-meta-grid' },
    el(
      'div',
      { className: 'bo-form-col' },
      el('h3', { className: 'bo-form-sec-title', text: 'Identitas Dokumen' }),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('labelNoSuratJalan') }),
        sjNumberEl,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Faktur Penjualan' }),
        invNumberEl,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('tanggal') }),
        dateEl,
      ),
    ),
    el(
      'div',
      { className: 'bo-form-col is-grow-2' },
      el('h3', { className: 'bo-form-sec-title', text: 'Ekspedisi & Penerima' }),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('labelNamaEkspedisi') }),
        expeditionNameEl,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('labelNoPolisiSupir') }),
        driverEl,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('labelPenerimaTujuan') }),
        recipientEl,
      ),
    ),
  );

  // Signatures Section (3 Signature boxes for logistics)
  const signatureSection = el(
    'div',
    { className: 'bo-panel bo-signature-grid' },
    el(
      'div',
      { className: 'bo-sig-box' },
      el('span', { className: 'bo-sig-box__role', text: label('labelTtdPengirim') }),
      el('div', { className: 'bo-sig-box__line' }),
      el('span', { className: 'bo-sig-box__name', text: 'Toko Budiannor' }),
    ),
    el(
      'div',
      { className: 'bo-sig-box' },
      el('span', { className: 'bo-sig-box__role', text: label('labelTtdEkspedisi') }),
      el('div', { className: 'bo-sig-box__line' }),
      el('span', { className: 'bo-sig-box__name', text: expeditionNote.driverName }),
    ),
    el(
      'div',
      { className: 'bo-sig-box' },
      el('span', { className: 'bo-sig-box__role', text: label('labelTtdPenerima') }),
      el('div', { className: 'bo-sig-box__line' }),
      el('span', { className: 'bo-sig-box__name', text: expeditionNote.recipientName }),
    ),
  );

  renderKoliList();

  container.replaceChildren(topBar, metaCard, koliContainerEl, signatureSection);

  return {
    element: container,
    destroy: () => undefined,
  };
}
