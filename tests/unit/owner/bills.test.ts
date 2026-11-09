import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { PurchaseOrder, SalesOrder } from '../../../src/shared/data/types';
import {
  billTotal,
  docKeyFromQuery,
  docQuery,
  findDocument,
  heldBillRows,
  orderRows,
  saleRows,
  saleStatus,
} from '../../../src/apps/owner/domain/bills';
import { need } from './support';

const data = generateDataset();
const first = need(data.products[0]);
const second = need(data.products[1]);

const salesOrder: SalesOrder = {
  id: 'SO-0001',
  number: 'SO-0001',
  createdAt: '2026-10-19T03:30:00.000Z',
  createdBy: 'U-1',
  customerId: 'C-003',
  lines: [
    { productId: first.id, unit: first.baseUnit, quantity: 2, unitPrice: 1500, listPrice: 1400 },
  ],
  total: 3000,
  payment: 'dp',
  downPayment: 1000,
  status: 'draf',
  source: 'owner',
  synced: false,
};

const purchaseOrder: PurchaseOrder = {
  id: 'PO-0001',
  number: 'PO-0001',
  createdAt: '2026-10-19T03:40:00.000Z',
  createdBy: 'U-1',
  supplierId: 'V-001',
  warehouse: 'besar',
  lines: [{ productId: second.id, unit: second.baseUnit, quantity: 3, unitPrice: 2000 }],
  total: 6000,
  status: 'dipesan',
};

const sources = { data, salesOrders: [salesOrder], purchaseOrders: [purchaseOrder] };

describe('daftar bill dan faktur', () => {
  it('menyusun bill ditahan dan transaksi dari yang terbaru', () => {
    const bills = heldBillRows(data);
    expect(bills).toHaveLength(3);
    expect(bills.every((row) => row.status === 'ditahan')).toBe(true);
    expect(need(bills[0]).at >= need(bills[1]).at).toBe(true);
    expect(need(bills.find((row) => row.ref === 'H-1')).total).toBe(
      billTotal(need(data.bills[0]).lines),
    );
    const sales = saleRows(data);
    expect(sales).toHaveLength(40);
    expect(need(sales[0]).at > need(sales[39]).at).toBe(true);
    expect(sales.every((row) => row.kind === 'sale' && row.number.startsWith('T-'))).toBe(true);
  });

  it('memberi status lunas, DP, atau piutang menurut pembayaran', () => {
    const base = need(data.sales[0]);
    expect(saleStatus({ ...base, paid: base.total })).toBe('lunas');
    expect(saleStatus({ ...base, paid: 1 })).toBe('dp');
    expect(saleStatus({ ...base, paid: 0 })).toBe('piutang');
  });

  it('memuat SO dan PO yang dibuat saat aplikasi berjalan', () => {
    const rows = orderRows(data, [salesOrder], [purchaseOrder]);
    expect(rows.map((row) => row.kind)).toEqual(['po', 'so']);
    expect(need(rows[1]).partyName).toBe(data.customers.find((item) => item.id === 'C-003')?.name);
    expect(need(rows[0]).partyName).toBe(data.suppliers[0]?.name);
  });

  it('membaca dan menulis kunci kueri bill, transaksi, SO, dan PO', () => {
    expect(docKeyFromQuery(new URLSearchParams('bill=H-1'))).toEqual({ kind: 'bill', ref: 'H-1' });
    expect(docKeyFromQuery(new URLSearchParams('trx=T-000101'))).toEqual({
      kind: 'sale',
      ref: 'T-000101',
    });
    expect(docKeyFromQuery(new URLSearchParams('so=SO-0001'))).toEqual({
      kind: 'so',
      ref: 'SO-0001',
    });
    expect(docKeyFromQuery(new URLSearchParams('po=PO-0001'))).toEqual({
      kind: 'po',
      ref: 'PO-0001',
    });
    expect(docKeyFromQuery(new URLSearchParams('tab=so'))).toBeUndefined();
    expect(docQuery({ kind: 'sale', ref: 'T-000101' })).toBe('trx=T-000101');
  });
});

describe('detail dokumen', () => {
  it('merinci transaksi: pembuat, pelanggan, barang, total, pembayaran, dan sisa', () => {
    const sale = need(data.sales.find((item) => item.payment === 'dp'));
    const detail = need(findDocument(sources, { kind: 'sale', ref: sale.number }));
    expect(detail.total).toBe(sale.total);
    expect(detail.lines).toHaveLength(sale.lines.length);
    expect(detail.lines.every((line) => line.name !== '' && line.code !== '')).toBe(true);
    expect(detail.paid + detail.remaining).toBe(sale.total);
    expect(detail.paid).toBe(sale.paid);
    expect(detail.userRole).toBe('kasir');
    expect(detail.payments[0]).toEqual({ method: 'dp', amount: sale.paid });
    expect(detail.status).toBe('dp');
  });

  it('merinci bill ditahan sebagai belum dibayar', () => {
    const detail = need(findDocument(sources, { kind: 'bill', ref: 'H-2' }));
    expect(detail.status).toBe('ditahan');
    expect(detail.paid).toBe(0);
    expect(detail.remaining).toBe(detail.total);
    expect(detail.partyName).toBe(data.customers.find((item) => item.id === 'C-003')?.name);
  });

  it('menandai harga yang diubah pada SO dan menghitung sisa setelah DP', () => {
    const detail = need(findDocument(sources, { kind: 'so', ref: 'SO-0001' }));
    expect(need(detail.lines[0]).listPrice).toBe(1400);
    expect(detail.total).toBe(3000);
    expect(detail.paid).toBe(1000);
    expect(detail.remaining).toBe(2000);
    expect(detail.synced).toBe(false);
  });

  it('merinci PO dengan pemasok dan gudang penerima', () => {
    const detail = need(findDocument(sources, { kind: 'po', ref: 'PO-0001' }));
    expect(detail.partyName).toBe(data.suppliers[0]?.name);
    expect(detail.warehouse).toBe('besar');
    expect(detail.total).toBe(6000);
    expect(detail.status).toBe('dipesan');
  });

  it('mengembalikan undefined untuk kunci yang tidak ada', () => {
    expect(findDocument(sources, { kind: 'sale', ref: 'T-999999' })).toBeUndefined();
    expect(findDocument(sources, { kind: 'bill', ref: 'H-9' })).toBeUndefined();
    expect(findDocument(sources, { kind: 'so', ref: 'SO-9999' })).toBeUndefined();
    expect(findDocument(sources, { kind: 'po', ref: 'PO-9999' })).toBeUndefined();
  });
});
