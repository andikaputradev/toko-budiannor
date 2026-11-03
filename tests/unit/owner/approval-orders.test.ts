import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { INITIAL_GUARD } from '../../../src/shared/domain/pin';
import { checkApproval } from '../../../src/apps/owner/domain/approval';
import {
  checkPurchaseOrder,
  checkSalesOrder,
  preferredUnit,
  suggestedCost,
} from '../../../src/apps/owner/domain/orders';
import { lateCustomer, need } from './support';

const data = generateDataset();
const now = new Date(data.referenceDate);
const first = need(data.products[0]);
const lookup = (id: string) => data.products.find((item) => item.id === id);

describe('persetujuan PIN Owner (aturan POS-10)', () => {
  const users = data.users;
  it('memeriksa alasan, PIN bukan Owner, PIN salah, dan kunci tiga kali', () => {
    expect(checkApproval(users, 'abc', '482916', INITIAL_GUARD, 0)).toMatchObject({
      kind: 'error',
      messageId: 'MSG-048',
    });
    expect(checkApproval(users, 'Pelanggan lama', '3571', INITIAL_GUARD, 0)).toMatchObject({
      messageId: 'MSG-050',
    });
    let guard = INITIAL_GUARD;
    const wrong = checkApproval(users, 'Pelanggan lama', '1111', guard, 0);
    expect(wrong).toMatchObject({ messageId: 'MSG-049', values: { sisa: 2 } });
    guard = wrong.guard;
    guard = checkApproval(users, 'Pelanggan lama', '2222', guard, 0).guard;
    const locked = checkApproval(users, 'Pelanggan lama', '3333', guard, 0);
    expect(locked).toMatchObject({ messageId: 'MSG-051' });
    expect(checkApproval(users, 'Pelanggan lama', '482916', locked.guard, 1000)).toMatchObject({
      messageId: 'MSG-051',
    });
  });

  it('menerima PIN Owner dan format PIN salah memberi MSG-022', () => {
    const ok = checkApproval(users, 'Pelanggan lama', '482916', INITIAL_GUARD, 0);
    expect(ok.kind).toBe('ok');
    expect(checkApproval(users, 'Pelanggan lama', '12', INITIAL_GUARD, 0)).toMatchObject({
      messageId: 'MSG-022',
    });
  });
});

describe('validasi Sales Order', () => {
  const draft = (patch: Partial<Parameters<typeof checkSalesOrder>[0]> = {}) => ({
    customerId: '',
    lines: [{ productId: first.id, unit: preferredUnit(first), quantity: '1' }],
    payment: 'tunai' as const,
    downPayment: '',
    ...patch,
  });

  it('menolak bill kosong, jumlah tidak valid, dan piutang tanpa pelanggan', () => {
    expect(checkSalesOrder(draft({ lines: [] }), lookup, undefined, now)).toMatchObject({
      kind: 'error',
      messageId: 'MSG-025',
    });
    expect(
      checkSalesOrder(
        draft({ lines: [{ productId: first.id, unit: 'Sak', quantity: '0' }] }),
        lookup,
        undefined,
        now,
      ),
    ).toMatchObject({ messageId: 'MSG-029', line: 0 });
    expect(
      checkSalesOrder(
        draft({ lines: [{ productId: first.id, unit: 'Sak', quantity: '1,2345' }] }),
        lookup,
        undefined,
        now,
      ),
    ).toMatchObject({ messageId: 'MSG-031' });
    expect(checkSalesOrder(draft({ payment: 'piutang' }), lookup, undefined, now)).toMatchObject({
      messageId: 'MSG-034',
    });
  });

  it('menghitung total dengan harga tier pelanggan dan menandai piutang over-limit atau menunggak', () => {
    const ok = checkSalesOrder(draft(), lookup, undefined, now);
    expect(ok).toMatchObject({ kind: 'ok', decision: { ok: true } });
    const customer = { ...lateCustomer(data, 12), limit: 100 };
    const blocked = checkSalesOrder(
      draft({ payment: 'piutang', customerId: customer.id }),
      lookup,
      customer,
      now,
    );
    expect(blocked).toMatchObject({ kind: 'ok', decision: { ok: false } });
    const rich = { ...lateCustomer(data, 12), limit: 900_000_000 };
    const overdue = checkSalesOrder(
      draft({ payment: 'piutang', customerId: rich.id }),
      lookup,
      rich,
      now,
    );
    expect(overdue).toMatchObject({ decision: { ok: false, reason: 'overdue' } });
  });

  it('mewajibkan DP lebih dari nol dan mengurangi nilai piutang', () => {
    const customer = { ...lateCustomer(data, 0), invoices: [], limit: 900_000_000 };
    expect(
      checkSalesOrder(draft({ payment: 'dp', customerId: customer.id }), lookup, customer, now),
    ).toMatchObject({ messageId: 'MSG-029' });
    const result = checkSalesOrder(
      draft({ payment: 'dp', customerId: customer.id, downPayment: '1.000' }),
      lookup,
      customer,
      now,
    );
    expect(result).toMatchObject({ kind: 'ok', downPayment: 1000, decision: { ok: true } });
  });
});

describe('validasi Purchase Order', () => {
  const line = { productId: first.id, unit: 'Sak', quantity: '2', unitPrice: '50.000' };
  it('memeriksa pemasok, gudang, baris, jumlah, dan harga beli', () => {
    expect(
      checkPurchaseOrder({ supplierId: '', warehouse: 'besar', lines: [line] }, lookup),
    ).toMatchObject({
      messageId: 'MSG-078',
    });
    expect(
      checkPurchaseOrder({ supplierId: 'V-001', warehouse: '', lines: [line] }, lookup),
    ).toMatchObject({
      messageId: 'MSG-081',
    });
    expect(
      checkPurchaseOrder({ supplierId: 'V-001', warehouse: 'besar', lines: [] }, lookup),
    ).toMatchObject({
      messageId: 'MSG-073',
    });
    expect(
      checkPurchaseOrder(
        { supplierId: 'V-001', warehouse: 'besar', lines: [{ ...line, quantity: '0' }] },
        lookup,
      ),
    ).toMatchObject({ messageId: 'MSG-029', line: 0 });
    expect(
      checkPurchaseOrder(
        { supplierId: 'V-001', warehouse: 'besar', lines: [{ ...line, unitPrice: '0' }] },
        lookup,
      ),
    ).toMatchObject({ messageId: 'MSG-080', line: 0 });
  });

  it('menjumlahkan total dan menyarankan harga beli dari HPP per satuan', () => {
    const result = checkPurchaseOrder(
      { supplierId: 'V-001', warehouse: 'besar', lines: [line] },
      lookup,
    );
    expect(result).toMatchObject({ kind: 'ok', total: 100_000 });
    const factor = need(first.units.find((unit) => unit.code === 'Sak')).factor;
    expect(suggestedCost(first, 'Sak')).toBe(Math.round(first.hpp * factor));
    expect(suggestedCost(first, first.baseUnit)).toBe(Math.round(first.hpp));
  });
});
