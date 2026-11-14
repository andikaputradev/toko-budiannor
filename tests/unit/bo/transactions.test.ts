import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  calculateSalesTotals,
  createSalesInvoiceDraft,
  getCustomerCreditInfo,
  importFromSalesOrder,
  buildSalesInvoiceWhatsAppMessage,
  fromDocLine,
  importedSoNumbers,
  toDocLine,
} from '../../../src/apps/bo/domain/sales-transaction';
import { expeditionSeeds } from '../../../src/apps/bo/domain/expedition';
import {
  calculatePurchaseTotals,
  createPurchaseInvoiceDraft,
  getSupplierDebtInfo,
  importFromPurchaseOrder,
  purchaseFromDocLine,
  purchaseToDocLine,
} from '../../../src/apps/bo/domain/purchase-transaction';
import {
  buildTransactionRows,
  calculateTransactionAgeDays,
  computeTransactionMetrics,
  countToday,
  dateRangeFor,
  filterTransactions,
  partyNames,
  type TransactionRow,
} from '../../../src/apps/bo/domain/transaction-list';

const dataset = generateDataset();

describe('domain transaksi back-office (Tahap 4)', () => {
  describe('Form Penjualan (BO-09 / form-penjualan.png)', () => {
    it('membuat draf penjualan default dengan nomor faktur dan tanggal terisi', () => {
      const draft = createSalesInvoiceDraft(dataset, '2026-10-25');
      expect(draft.invoiceNumber).toMatch(/^FJ26/);
      expect(draft.date).toBe('2026-10-25');
      expect(draft.paymentTerms).toBe('piutang');
      expect(draft.lines).toEqual([]);
    });

    it('menghitung total penjualan dengan diskon bertingkat 5+5, diskon nota, dan ongkir ekspedisi', () => {
      const lines = [
        {
          id: 'L1',
          productId: 'P-01',
          productName: 'Semen Gresik 40kg',
          aliasName: 'Semen Gresik',
          warehouse: 'toko' as const,
          unit: 'ZAK',
          quantity: 20,
          unitPrice: 70_000,
          discountExpr: '',
        },
        {
          id: 'L2',
          productId: 'P-02',
          productName: 'Lem Fox 70gr',
          aliasName: 'Lem Fox',
          warehouse: 'toko' as const,
          unit: 'PCS',
          quantity: 20,
          unitPrice: 50_000,
          discountExpr: '5+5', // 20 x 50.000 = 1.000.000 -> 902.500
        },
      ];
      // Subtotal L1 = 1.400.000
      // Subtotal L2 = 902.500
      // Total lines = 2.302.500
      // Diskon nota = 2.500
      // Ongkir = 50.000
      // Grand total = 2.350.000
      const totals = calculateSalesTotals(lines, 2_500, 50_000);
      expect(totals.subtotal).toBe(2_302_500);
      expect(totals.invoiceDiscount).toBe(2_500);
      expect(totals.expeditionFee).toBe(50_000);
      expect(totals.grandTotal).toBe(2_350_000);
    });

    it('menghitung info piutang dan mendeteksi overlimit plafon pelanggan', () => {
      const customer = dataset.customers[1]; // Bu Sherly Tjoandra
      if (!customer) throw new Error('Customer tidak ada');

      const info = getCustomerCreditInfo(customer, 25_000_000);
      expect(info.totalPiutang).toBeGreaterThan(0);
      expect(info.creditLimit).toBeGreaterThan(0);
      expect(typeof info.isOverlimit).toBe('boolean');
    });

    it('mengimpor data dari Sales Order (SO) pending secara otomatis', () => {
      const product = dataset.products[0];
      if (!product) throw new Error('Product kosong');

      const fakeSO = {
        id: 'SO-999',
        number: 'SO26104444',
        createdAt: '2026-10-25T10:00:00Z',
        createdBy: 'U-1',
        customerId: dataset.customers[1]?.id,
        lines: [{ productId: product.id, unit: product.baseUnit, quantity: 10, unitPrice: 65_000 }],
        total: 650_000,
        payment: 'piutang' as const,
        downPayment: 100_000,
        status: 'draf' as const,
        source: 'sales' as const,
      };

      const draft = importFromSalesOrder(fakeSO, dataset);
      expect(draft.soNumber).toBe('SO26104444');
      expect(draft.customerId).toBe(dataset.customers[1]?.id);
      expect(draft.customerName).toBe(dataset.customers[1]?.name);
      expect(draft.lines).toHaveLength(1);
      expect(draft.lines[0]?.quantity).toBe(10);
    });

    it('menghasilkan teks WhatsApp siap kirim dengan rincian nota', () => {
      const draft = createSalesInvoiceDraft(dataset, '2026-10-25');
      const msg = buildSalesInvoiceWhatsAppMessage({
        ...draft,
        customerName: 'Bu Sherly Tjoandra',
        grandTotal: 1_500_000,
        lines: [
          {
            id: '1',
            productId: 'P-1',
            productName: 'Semen Gresik',
            aliasName: '',
            warehouse: 'toko',
            unit: 'ZAK',
            quantity: 20,
            unitPrice: 75000,
            discountExpr: '',
          },
        ],
      });
      expect(msg).toContain('Toko Budiannor');
      expect(msg).toContain(draft.invoiceNumber);
      expect(msg).toContain('Rp 1.500.000');
    });
  });

  describe('Form Pembelian (BO-08 / form-pembelian.png)', () => {
    it('membuat draf pembelian default dengan nomor faktur pembelian', () => {
      const draft = createPurchaseInvoiceDraft(dataset, '2026-10-25');
      expect(draft.invoiceNumber).toMatch(/^FB26/);
      expect(draft.receivedDate).toBe('2026-10-25');
      expect(draft.paymentTerms).toBe('hutang');
    });

    it('menghitung total faktur pembelian dengan diskon supplier dan biaya ekspedisi', () => {
      const lines = [
        {
          id: 'PL1',
          productId: 'P-01',
          productName: 'Selang Maspion 3/4',
          productCode: 'SLG-034',
          destination: 'gudang' as const,
          unit: 'ROL',
          quantity: 10,
          unitPrice: 200_000,
          discountExpr: '3+2.5', // 10 x 200.000 = 2.000.000 -> -3% = 1.940.000 -> -2.5% = 1.891.500
          shipping: 0,
        },
      ];
      // Subtotal = 1.891.500
      // Diskon nota = 1.500
      // Biaya ekspedisi = 0
      // Total = 1.890.000
      const totals = calculatePurchaseTotals(lines, 1_500, 0);
      expect(totals.subtotal).toBe(1_891_500);
      expect(totals.invoiceDiscount).toBe(1_500);
      expect(totals.grandTotal).toBe(1_890_000);
    });

    it('mengambil info total hutang dan jatuh tempo pemasok', () => {
      const supplier = dataset.suppliers[0];
      if (!supplier) throw new Error('Supplier tidak ada');
      const debt = getSupplierDebtInfo(supplier);
      expect(debt.totalHutang).toBe(supplier.payable);
    });

    it('mengimpor data dari Purchase Order (PO) pending', () => {
      const product = dataset.products[0];
      const supplier = dataset.suppliers[0];
      if (!product || !supplier) throw new Error('Data tidak lengkap');

      const fakePO = {
        id: 'PO-100',
        number: 'PO26104444',
        createdAt: '2026-10-25T10:00:00Z',
        createdBy: 'U-1',
        supplierId: supplier.id,
        warehouse: 'besar' as const,
        lines: [{ productId: product.id, unit: product.baseUnit, quantity: 50, unitPrice: 60_000 }],
        total: 3_000_000,
        status: 'dipesan' as const,
      };

      const draft = importFromPurchaseOrder(fakePO, dataset);
      expect(draft.poNumber).toBe('PO26104444');
      expect(draft.supplierId).toBe(supplier.id);
      expect(draft.lines).toHaveLength(1);
      expect(draft.lines[0]?.quantity).toBe(50);
    });
  });

  describe('Daftar Nota Penjualan & Pembelian (daftar-penjualan-pembelian.png)', () => {
    it('menghitung umur nota transaksi dalam satuan hari secara tepat', () => {
      const age0 = calculateTransactionAgeDays('2026-10-25', '2026-10-25');
      expect(age0).toBe(0);

      const age7 = calculateTransactionAgeDays('2026-10-18', '2026-10-25');
      expect(age7).toBe(7);

      const age30 = calculateTransactionAgeDays('2026-09-25', '2026-10-25');
      expect(age30).toBe(30);
    });

    it('menyaring daftar nota berdasarkan jenis transaksi dan status', () => {
      const rows = [
        {
          type: 'penjualan' as const,
          number: 'FJ26101234',
          date: '2026-10-25',
          partyName: 'Bu Sherly Tjoandra',
          paymentTerms: 'Piutang (30 Hari)',
          status: 'belum-lunas' as const,
          ageDays: 5,
          total: 2_450_000,
          refNumber: '',
          user: 'Rizal',
          notes: '',
        },
        {
          type: 'pembelian' as const,
          number: 'FB26101234',
          date: '2026-10-25',
          partyName: 'PT Sejati Raya',
          paymentTerms: 'Hutang (30 Hari)',
          status: 'lunas' as const,
          ageDays: 2,
          total: 1_890_000,
          refNumber: '',
          user: 'Rizal',
          notes: '',
        },
      ];

      const salesOnly = filterTransactions(rows, { type: 'penjualan', status: 'semua', query: '' });
      expect(salesOnly).toHaveLength(1);
      expect(salesOnly[0]?.number).toBe('FJ26101234');

      const lunasOnly = filterTransactions(rows, { type: 'semua', status: 'lunas', query: '' });
      expect(lunasOnly).toHaveLength(1);
      expect(lunasOnly[0]?.number).toBe('FB26101234');
    });

    const row = (over: Partial<TransactionRow>): TransactionRow => ({
      type: 'penjualan',
      number: 'FJ0',
      date: '2026-10-19',
      partyName: 'Toko Arif',
      paymentTerms: 'Tunai',
      status: 'lunas',
      ageDays: 0,
      total: 100,
      refNumber: '',
      user: 'Rizal',
      notes: '',
      ...over,
    });

    it('membangun baris daftar dengan kolom No. SO atau PO, User, dan Keterangan (gambar 8)', () => {
      const rows = buildTransactionRows(dataset);
      const fj = rows.find((item) => item.number === 'FJ26101234');
      expect(fj).toMatchObject({
        type: 'penjualan',
        refNumber: '26101234',
        user: 'Rizal',
        notes: 'Barang Besok Diambil',
      });
      expect(rows.every((item) => item.user !== '')).toBe(true);
      const cashierName = dataset.users.find(
        (user) => user.id === dataset.sales[0]?.cashierId,
      )?.name;
      const pos = rows.find((item) => item.number === dataset.sales[0]?.number);
      expect(pos?.user).toBe(cashierName);
      const dates = rows.map((item) => item.date);
      expect([...dates].sort().reverse()).toEqual(dates);
      const purchases = rows.filter((item) => item.type === 'pembelian');
      expect(purchases.length).toBeGreaterThan(0);
      expect(purchases.every((item) => item.refNumber.startsWith('PO'))).toBe(true);
    });

    it('menghitung jumlah dan nilai transaksi hari ini', () => {
      const rows = [
        row({ number: 'A', date: '2026-10-19', total: 100 }),
        row({ number: 'B', date: '2026-10-19', total: 250 }),
        row({ number: 'C', date: '2026-10-18', total: 900 }),
      ];
      expect(countToday(rows, '2026-10-19')).toEqual({ count: 2, total: 350 });
      expect(countToday([], '2026-10-19')).toEqual({ count: 0, total: 0 });
    });

    it('menyaring menurut pelanggan atau pemasok dan rentang tanggal', () => {
      const rows = [
        row({ number: 'A', partyName: 'Toko Arif', date: '2026-10-19' }),
        row({ number: 'B', partyName: 'Bu Wati', date: '2026-10-10' }),
      ];
      const base = { type: 'semua', status: 'semua', query: '' } as const;
      expect(filterTransactions(rows, { ...base, party: 'Bu Wati' }).map((r) => r.number)).toEqual([
        'B',
      ]);
      expect(
        filterTransactions(rows, { ...base, startDate: '2026-10-15', endDate: '2026-10-19' }).map(
          (r) => r.number,
        ),
      ).toEqual(['A']);
      expect(filterTransactions(rows, { ...base, party: '' })).toHaveLength(2);
    });

    it('rentang tanggal pilihan filter dihitung dari hari ini', () => {
      expect(dateRangeFor('semua', '2026-10-19')).toEqual({});
      expect(dateRangeFor('hari-ini', '2026-10-19')).toEqual({
        startDate: '2026-10-19',
        endDate: '2026-10-19',
      });
      expect(dateRangeFor('tujuh-hari', '2026-10-19')).toEqual({
        startDate: '2026-10-13',
        endDate: '2026-10-19',
      });
      expect(dateRangeFor('bulan-ini', '2026-10-19')).toEqual({
        startDate: '2026-10-01',
        endDate: '2026-10-19',
      });
    });

    it('daftar pihak untuk filter: unik, terurut, hanya jenis yang dipilih', () => {
      const rows = [
        row({ partyName: 'Toko Arif' }),
        row({ partyName: 'Bu Wati' }),
        row({ partyName: 'Toko Arif' }),
        row({ type: 'pembelian', partyName: 'PT Sejati Raya' }),
      ];
      expect(partyNames(rows, 'penjualan')).toEqual(['Bu Wati', 'Toko Arif']);
      expect(partyNames(rows, 'pembelian')).toEqual(['PT Sejati Raya']);
    });

    it('menghitung metrik total nilai, total belum lunas, dan jatuh tempo', () => {
      const rows = [
        {
          type: 'penjualan' as const,
          number: 'FJ1',
          date: '2026-10-25',
          partyName: 'Pelanggan 1',
          paymentTerms: 'Piutang',
          status: 'belum-lunas' as const,
          ageDays: 10,
          total: 1_000_000,
          refNumber: '',
          user: 'Rizal',
          notes: '',
        },
        {
          type: 'penjualan' as const,
          number: 'FJ2',
          date: '2026-09-20',
          partyName: 'Pelanggan 2',
          paymentTerms: 'Piutang',
          status: 'jatuh-tempo' as const,
          ageDays: 35,
          total: 2_000_000,
          refNumber: '',
          user: 'Rizal',
          notes: '',
        },
      ];

      const metrics = computeTransactionMetrics(rows);
      expect(metrics.totalNilai).toBe(3_000_000);
      expect(metrics.totalBelumLunas).toBe(3_000_000);
      expect(metrics.totalJatuhTempo).toBe(2_000_000);
    });
  });
});

describe('baris faktur penjualan dan DocLine (gambar 9)', () => {
  const invoiceLine = {
    id: 'L-9',
    productId: 'P-9',
    productName: 'SEMEN GRESIK 40KG',
    aliasName: 'SEMEN GRESIK 40KG',
    warehouse: 'gudang' as const,
    unit: 'SAK',
    quantity: 10,
    unitPrice: 70_000,
    discountExpr: 'Rp 2000',
    lastSalePrice: 70_000,
  };

  it('toDocLine membawa kode, tanpa tanda Koli dan tanpa ongkos kirim', () => {
    expect(toDocLine(invoiceLine, '0001')).toEqual({
      id: 'L-9',
      productId: 'P-9',
      productName: 'SEMEN GRESIK 40KG',
      code: '0001',
      warehouse: 'gudang',
      unit: 'SAK',
      quantity: 10,
      unitPrice: 70_000,
      discountExpr: 'Rp 2000',
      shipping: 0,
      koli: false,
    });
  });

  it('fromDocLine membalik toDocLine tanpa kehilangan nilai baris faktur', () => {
    expect(fromDocLine(toDocLine(invoiceLine, '0001'))).toEqual(invoiceLine);
  });

  it('himpunan SO yang sudah diimpor dan benih Surat Jalan dimulai kosong', () => {
    expect(importedSoNumbers.size).toBe(0);
    expect(expeditionSeeds.size).toBe(0);
  });
});

describe('baris faktur pembelian dan DocLine (gambar 9, varian pembelian)', () => {
  const invoiceLine = {
    id: 'L-5',
    productId: 'P-5',
    productName: 'SEMEN GRESIK 40KG',
    productCode: '0001',
    destination: 'toko' as const,
    unit: 'SAK',
    quantity: 10,
    unitPrice: 55_000,
    discountExpr: '5%',
    shipping: 5000,
    lastPurchasePrice: 54_000,
    lastPurchaseDate: '2026-09-12',
  };

  it('purchaseToDocLine memetakan tujuan masuk stok ke gudang dan membawa ongkos kirim', () => {
    expect(purchaseToDocLine(invoiceLine)).toEqual({
      id: 'L-5',
      productId: 'P-5',
      productName: 'SEMEN GRESIK 40KG',
      code: '0001',
      warehouse: 'toko',
      unit: 'SAK',
      quantity: 10,
      unitPrice: 55_000,
      discountExpr: '5%',
      shipping: 5000,
      koli: false,
    });
    expect(purchaseToDocLine({ ...invoiceLine, destination: 'gudang' }).warehouse).toBe('gudang');
  });

  it('purchaseFromDocLine membalik tanpa kehilangan nilai inti baris', () => {
    const back = purchaseFromDocLine(purchaseToDocLine(invoiceLine));
    expect(back).toMatchObject({
      id: 'L-5',
      productCode: '0001',
      destination: 'toko',
      unit: 'SAK',
      quantity: 10,
      unitPrice: 55_000,
      discountExpr: '5%',
      shipping: 5000,
    });
  });

  it('baris hasil impor PO membawa ongkos kirim nol', () => {
    const supplier = dataset.suppliers[0];
    const product = dataset.products[0];
    if (supplier === undefined || product === undefined) {
      throw new Error('dataset kosong');
    }
    const draft = importFromPurchaseOrder(
      {
        id: 'PO-X',
        number: 'PO26109999',
        createdAt: '2026-10-19T03:00:00.000Z',
        createdBy: 'U-1',
        supplierId: supplier.id,
        warehouse: 'besar',
        lines: [{ productId: product.id, unit: product.baseUnit, quantity: 2, unitPrice: 1000 }],
        total: 2000,
        status: 'dipesan',
      },
      dataset,
    );
    expect(draft.lines[0]?.shipping).toBe(0);
  });
});
