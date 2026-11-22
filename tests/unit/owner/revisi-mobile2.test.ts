import { describe, expect, it } from 'vitest';
import { buildDocCopy } from '../../../src/apps/owner/domain/doc-copy';
import { findDocument } from '../../../src/apps/owner/domain/bills';
import { allocationsOf, paymentRows } from '../../../src/apps/owner/domain/payment-history';
import { need, setup } from './support';

const invoices = (paid: readonly number[]): { id: string; paid: number }[] =>
  paid.map((value, index) => ({ id: `INV-${String(index + 1)}`, paid: value }));

describe('selisih faktur yang dibayar', () => {
  it('mengambil hanya faktur yang `paid`-nya bertambah', () => {
    expect(allocationsOf(invoices([0, 0, 100]), invoices([300, 50, 100]))).toEqual([
      { invoiceId: 'INV-1', amount: 300 },
      { invoiceId: 'INV-2', amount: 50 },
    ]);
  });

  it('kosong bila tidak ada faktur yang berubah', () => {
    expect(allocationsOf(invoices([10]), invoices([10]))).toEqual([]);
    expect(allocationsOf([], [])).toEqual([]);
  });
});

describe('bukti pembayaran hutang piutang', () => {
  it('mencatat bukti BPT dan BHT berurutan dengan rincian faktur dan sisa', () => {
    const { session, store, dataset } = setup();
    const customer = need(dataset.customers.find((item) => item.invoices.length > 0));
    const owed = customer.invoices.reduce((sum, item) => sum + item.amount - item.paid, 0);
    const amount = Math.min(owed, 50_000);
    const first = session.recordPayment(customer.id, String(amount), 'tunai');
    expect(first).toMatchObject({ ok: true, number: 'BPT-001' });
    const supplier = need(dataset.suppliers.find((item) => item.payable > 0));
    const second = session.payPayable(supplier.id, '10.000', 'transfer');
    expect(second).toMatchObject({ ok: true, number: 'BHT-001' });
    const third = session.recordPayment(customer.id, '1.000', 'qris');
    expect(third).toMatchObject({ ok: true, number: 'BPT-002' });

    const records = store.getState().debtPayments;
    expect(records.map((item) => item.number)).toEqual(['BPT-001', 'BHT-001', 'BPT-002']);
    expect(records[0]).toMatchObject({
      kind: 'piutang',
      partyId: customer.id,
      partyName: customer.name,
      method: 'tunai',
      amount,
    });
    expect(records[0]?.allocations.reduce((sum, item) => sum + item.amount, 0)).toBe(amount);
    expect(records[1]).toMatchObject({ kind: 'hutang', method: 'transfer', amount: 10_000 });
    expect(records[1]?.remaining).toBe(supplier.payable - 10_000);
  });

  it('daftar bukti terbaru lebih dulu dan memuat nama pembuat', () => {
    const { session, store, dataset } = setup();
    const customer = need(dataset.customers.find((item) => item.invoices.length > 0));
    session.recordPayment(customer.id, '1.000', 'tunai');
    const rows = paymentRows(store.getState().data, store.getState().debtPayments);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ number: 'BPT-001', userName: 'Bapak Haris', total: 1000 });
  });

  it('bukti hilang saat data diatur ulang', () => {
    const { session, store, dataset } = setup();
    const customer = need(dataset.customers.find((item) => item.invoices.length > 0));
    session.recordPayment(customer.id, '1.000', 'tunai');
    expect(store.getState().debtPayments).toHaveLength(1);
    store.resetData();
    expect(store.getState().debtPayments).toHaveLength(0);
  });
});

describe('Purchase Order dengan cara bayar', () => {
  it('menyimpan Tunai bila tidak dipilih dan Hutang bila dipilih', () => {
    const { session, store, dataset } = setup();
    const product = need(dataset.products[0]);
    const line = {
      productId: product.id,
      unit: product.baseUnit,
      quantity: '1',
      unitPrice: '5000',
    };
    session.savePurchaseOrder({ supplierId: 'V-001', warehouse: 'besar', lines: [line] });
    session.savePurchaseOrder({
      supplierId: 'V-001',
      warehouse: 'besar',
      payment: 'hutang',
      lines: [line],
    });
    const orders = store.getState().purchaseOrders;
    expect(orders.map((item) => item.payment)).toEqual(['tunai', 'hutang']);
    const detail = need(
      findDocument(
        {
          data: store.getState().data,
          salesOrders: [],
          purchaseOrders: store.getState().purchaseOrders,
        },
        { kind: 'po', ref: 'PO-0002' },
      ),
    );
    expect(detail.poPayment).toBe('hutang');
  });
});

describe('kirim draf SO dan PO via WA', () => {
  const fixture = () => {
    const ctx = setup();
    const product = need(ctx.dataset.products[0]);
    const so = ctx.session.saveSalesOrder({
      customerId: '',
      lines: [{ productId: product.id, unit: product.baseUnit, quantity: '2' }],
      payment: 'tunai',
      downPayment: '',
    });
    const po = ctx.session.savePurchaseOrder({
      supplierId: 'V-001',
      warehouse: 'besar',
      lines: [{ productId: product.id, unit: product.baseUnit, quantity: '1', unitPrice: '5000' }],
    });
    return { ...ctx, so, po };
  };

  it('menolak nomor WA yang tidak valid dan dokumen yang tidak ada', () => {
    const { session } = fixture();
    expect(session.sendOrderCopy('so', 'SO-0001', '123')).toMatchObject({ messageId: 'MSG-044' });
    expect(session.sendOrderCopy('so', 'SO-9999', '081234567890')).toMatchObject({
      messageId: 'MSG-118',
    });
  });

  it('mengirim SO dan PO, mencatat waktu kirim dan log aktivitas', () => {
    const { session, store } = fixture();
    expect(session.sendOrderCopy('so', 'SO-0001', '0812-3456-7890')).toEqual({
      ok: true,
      queued: false,
    });
    expect(session.sendOrderCopy('po', 'PO-0001', '+6281234567890')).toEqual({
      ok: true,
      queued: false,
    });
    expect(Object.keys(session.state().sent)).toEqual(['SO-0001', 'PO-0001']);
    const log = store.getState().activity.at(-1);
    expect(log?.kind).toBe('cetak');
    expect(log?.detail).toContain('PO-0001');
    expect(log?.detail).toContain('+6281234567890');
  });

  it('offline: draf tetap tercatat terkirim tetapi masuk antrean sinkron', () => {
    const { session, store } = fixture();
    store.setOnline(false);
    expect(session.sendOrderCopy('so', 'SO-0001', '081234567890')).toEqual({
      ok: true,
      queued: true,
    });
    expect(session.state().queue.some((item) => item.text.includes('SO-0001 via WA'))).toBe(true);
  });

  it('isi PDF memuat judul, nomor, pihak, barang, total, dan cara bayar', () => {
    const { store } = fixture();
    const state = store.getState();
    const detail = need(
      findDocument(
        { data: state.data, salesOrders: state.salesOrders, purchaseOrders: state.purchaseOrders },
        { kind: 'po', ref: 'PO-0001' },
      ),
    );
    const copy = buildDocCopy(detail, 'Bapak Haris');
    expect(copy[0]).toBe('SALINAN PURCHASE ORDER');
    expect(copy).toContain('No. PO: PO-0001');
    expect(copy.some((row) => row.startsWith('Pemasok:'))).toBe(true);
    expect(copy.some((row) => row.startsWith('Total: Rp'))).toBe(true);
    expect(copy).toContain('Cara bayar: Tunai');
  });
});
