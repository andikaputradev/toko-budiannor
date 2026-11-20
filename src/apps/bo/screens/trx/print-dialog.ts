import { el, nextId } from '../../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../../shared/format';
import { label } from '../../../../shared/messages';
import { openModal } from '../../../../shared/ui/modal';
import { showToast } from '../../../../shared/ui/toast';
import { lineAmount, type DocLine } from '../../domain/doc-line';
import {
  buildSalesInvoiceWhatsAppMessage,
  generateWhatsAppUrl,
  type SalesInvoiceDraft,
} from '../../domain/sales-transaction';
import { openExportPreview } from '../../export-preview';

// Kotak pilihan cetak Form Penjualan (gambar klien 52): pilihan dokumen berupa radio, Gudang, tiga
// opsi kertas, lalu Print, Kirim WA, Export Excel, Export PDF, dan Tutup. Kotak ini hanya muncul saat
// tombol Cetak ditekan; Simpan tidak lagi memunculkannya.
const TEXT = {
  judul: 'Cetak Form Penjualan',
  daftar: 'Faktur / Surat Jalan / DO Gudang / Surat Order',
  gudang: 'Gudang',
  semua: 'Semua',
  dokumen: 'Pilihan dokumen yang dicetak',
  kertas: 'Kertas Besar A4',
  tanpaHeader: 'Tanpa Header Toko',
  rekening: 'Tampilkan Rekening',
  print: 'Print',
  kirimWa: 'Kirim WA',
  excel: 'Export Excel',
  pdf: 'Export PDF',
  dikirim: '{dokumen} {nomor} dikirim ke printer.',
  waDibuka: 'Tautan WhatsApp telah dibuka.',
} as const;

const DOCUMENTS = [
  { value: 'faktur', text: 'Cetak Faktur Penjualan', title: 'Faktur Penjualan' },
  { value: 'surat-jalan', text: 'Cetak Surat Jalan Penjualan', title: 'Surat Jalan Penjualan' },
  {
    value: 'surat-jalan-ekspedisi',
    text: 'Cetak Surat Jalan Ekspedisi',
    title: 'Surat Jalan Ekspedisi',
  },
  { value: 'surat-order', text: 'Cetak Surat Order Penjualan', title: 'Surat Order Penjualan' },
  { value: 'do-gudang', text: 'Cetak Surat D.O Gudang', title: 'Surat D.O Gudang' },
] as const;

type Warehouse = 'toko' | 'gudang';

export interface SalesPrintOptions {
  // Isi form saat ini; dibaca ulang setiap tombol ditekan.
  readonly current: () => SalesInvoiceDraft;
  readonly lines: () => readonly DocLine[];
}

export function openSalesPrintDialog(options: SalesPrintOptions): void {
  const radioName = nextId('cetak-dokumen');
  const radios = DOCUMENTS.map((doc, index) => {
    const input = el('input', {
      attrs: { type: 'radio', name: radioName, value: doc.value, checked: index === 0 && 'true' },
    });
    return {
      doc,
      input,
      row: el('label', { className: 'bo-pm__radio' }, input, el('span', { text: doc.text })),
    };
  });
  const warehouseId = nextId('cetak-gudang');
  const warehouse = el(
    'select',
    { className: 'input is-select bo-pm__select', attrs: { id: warehouseId } },
    el('option', { text: TEXT.semua, attrs: { value: '' } }),
    el('option', { text: label('namaGudangDisplay'), attrs: { value: 'toko' } }),
    el('option', { text: label('namaGudangBesar'), attrs: { value: 'gudang' } }),
  );
  const check = (text: string, checked: boolean): HTMLElement =>
    el(
      'label',
      { className: 'bo-chk-lbl' },
      el('input', { attrs: { type: 'checkbox', checked: checked && 'true' } }),
      el('span', { text }),
    );

  const body = el(
    'div',
    { className: 'bo-pm' },
    el('p', { className: 'bo-pm__list', text: TEXT.daftar }),
    el(
      'div',
      { className: 'bo-pm__warehouse' },
      el('label', { attrs: { for: warehouseId }, text: TEXT.gudang }),
      warehouse,
    ),
    el(
      'div',
      { className: 'bo-pm__radios', attrs: { role: 'radiogroup', 'aria-label': TEXT.dokumen } },
      ...radios.map((radio) => radio.row),
    ),
    el(
      'div',
      { className: 'bo-pm__options' },
      check(TEXT.kertas, true),
      check(TEXT.tanpaHeader, false),
      check(TEXT.rekening, false),
    ),
  );

  const chosen = (): (typeof DOCUMENTS)[number] =>
    radios.find((radio) => radio.input.checked)?.doc ?? DOCUMENTS[0];
  const scope = (): Warehouse | undefined =>
    warehouse.value === 'toko' || warehouse.value === 'gudang' ? warehouse.value : undefined;
  const scopedLines = (): readonly DocLine[] =>
    options.lines().filter((line) => scope() === undefined || line.warehouse === scope());
  const exportTable = (kind: 'excel' | 'pdf'): void => {
    const current = options.current();
    openExportPreview({
      kind,
      title: `${chosen().title} ${current.invoiceNumber}`,
      columns: ['Kode', 'Nama Barang', 'Gudang', 'Jumlah', 'Satuan', 'Harga', 'Total'],
      rows: scopedLines().map((line) => [
        line.code,
        line.productName,
        label(line.warehouse === 'toko' ? 'namaGudangDisplay' : 'namaGudangBesar'),
        formatDecimal(line.quantity),
        line.unit,
        formatRupiah(line.unitPrice),
        formatRupiah(lineAmount(line)),
      ]),
    });
  };

  openModal({
    title: TEXT.judul,
    body,
    actions: [
      {
        text: TEXT.print,
        variant: 'primary',
        icon: 'printer',
        onClick: () => {
          window.print();
          showToast({
            kind: 'success',
            text: TEXT.dikirim
              .replace('{dokumen}', chosen().title)
              .replace('{nomor}', options.current().invoiceNumber),
          });
        },
      },
      {
        text: TEXT.kirimWa,
        variant: 'primary',
        onClick: () => {
          const current = options.current();
          const filtered = {
            ...current,
            lines: current.lines.filter(
              (line) => scope() === undefined || line.warehouse === scope(),
            ),
          };
          const message = buildSalesInvoiceWhatsAppMessage(filtered, 'Toko Budiannor');
          window.open(
            generateWhatsAppUrl(current.customerPhone || '0811230988', message),
            '_blank',
          );
          showToast({ kind: 'success', text: TEXT.waDibuka });
        },
      },
      {
        text: TEXT.excel,
        variant: 'secondary',
        icon: 'download',
        onClick: () => {
          exportTable('excel');
        },
      },
      {
        text: TEXT.pdf,
        variant: 'secondary',
        icon: 'file-text',
        onClick: () => {
          exportTable('pdf');
        },
      },
      { text: label('tutup'), variant: 'secondary' },
    ],
  });
}
