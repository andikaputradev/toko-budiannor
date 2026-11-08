import { describe, expect, it } from 'vitest';
import type { Sale, SalePayment } from '../../../src/shared/data/types';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import { createStore } from '../../../src/shared/store/store';
import { buildShiftReport, methodTransactions } from '../../../src/apps/pos/domain/shift-report';
import type { Shift } from '../../../src/apps/pos/domain/shift';
import {
  createPosSession,
  type Expense,
  type ReturnRecord,
} from '../../../src/apps/pos/pos-session';

const dataset = withProposalData(generateDataset());

const SHIFT: Shift = { userId: 'U-3', startedAt: '2026-11-07T01:00:00.000Z', openingCash: 100000 };
const AFTER = '2026-11-07T02:00:00.000Z';
const BEFORE = '2026-11-07T00:00:00.000Z';

function sale(
  number: string,
  total: number,
  payments: readonly SalePayment[],
  createdAt = AFTER,
): Sale {
  const paid = payments.filter((row) => row.method !== 'piutang').reduce((s, r) => s + r.amount, 0);
  return {
    id: `S-${number}`,
    number,
    createdAt,
    cashierId: 'U-3',
    customerId: undefined,
    lines: [],
    total,
    payment: payments[0]?.method ?? 'tunai',
    paid: Math.min(paid, total),
    payments,
  };
}

const SALES: readonly Sale[] = [
  sale('T-1', 70000, [{ method: 'tunai', amount: 100000 }]),
  sale('T-2', 70000, [
    { method: 'tunai', amount: 30000 },
    { method: 'transfer', amount: 40000, channel: 'BCA' },
  ]),
  sale('T-3', 50000, [{ method: 'qris', amount: 50000, channel: 'Gopay' }]),
  sale('T-4', 30000, [
    { method: 'transfer', amount: 20000, channel: 'BRI' },
    { method: 'transfer', amount: 10000, channel: 'BCA' },
  ]),
  sale('T-5', 70000, [
    { method: 'dp', amount: 20000, via: 'tunai' },
    { method: 'piutang', amount: 50000 },
  ]),
  sale('T-6', 10000, [{ method: 'tunai', amount: 10000 }], BEFORE),
  sale('T-7', 10000, [{ method: 'tunai', amount: 10000 }]),
];
const DEVICE = ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6'];

function expense(id: string, amount: number, at = AFTER): Expense {
  return { id, at, userId: 'U-3', kind: 'bensin', note: '', amount };
}

function returned(
  number: string,
  refund: ReturnRecord['refund'],
  at = AFTER,
  value = 15000,
): ReturnRecord {
  return { number, saleNumber: 'T-1', at, reason: 'barang', value, lines: [], refund };
}

describe('buildShiftReport', () => {
  it('mengelompokkan penerimaan per metode dan kanal dengan jumlah transaksi', () => {
    const report = buildShiftReport(SHIFT, SALES, DEVICE, [], []);
    expect(report.byMethod.map((item) => item.key)).toEqual([
      'tunai:',
      'qris:Gopay',
      'transfer:BCA',
      'transfer:BRI',
    ]);
    const find = (key: string) => report.byMethod.find((item) => item.key === key);
    expect(find('tunai:')).toMatchObject({ method: 'tunai', receipts: 3, amount: 120000 });
    expect(find('qris:Gopay')).toMatchObject({
      method: 'qris',
      channel: 'Gopay',
      receipts: 1,
      amount: 50000,
    });
    expect(find('transfer:BCA')).toMatchObject({ receipts: 2, amount: 50000 });
    expect(find('transfer:BRI')).toMatchObject({ receipts: 1, amount: 20000 });
    expect(report.receipts).toEqual({ count: 5, amount: 240000 });
  });

  it('mengabaikan penjualan sebelum shift, dari perangkat lain, dan baris piutang', () => {
    const report = buildShiftReport(SHIFT, SALES, ['T-6', 'T-7'], [], []);
    expect(report.byMethod).toEqual([
      expect.objectContaining({ key: 'tunai:', receipts: 1, amount: 10000 }),
    ]);
    expect(report.receipts).toEqual({ count: 1, amount: 10000 });
    expect(buildShiftReport(SHIFT, SALES, [], [], []).byMethod).toEqual([]);
  });

  it('retur dan biaya masuk total dan jumlah, retur per metode tercatat', () => {
    const report = buildShiftReport(
      SHIFT,
      SALES,
      DEVICE,
      [expense('E-1', 12000), expense('E-2', 8000), expense('E-0', 5000, BEFORE)],
      [
        returned('R-1', { method: 'tunai', amount: 30000 }),
        returned('R-2', { method: 'transfer', amount: 20000, channel: 'BCA' }),
        returned('R-3', undefined),
        returned('R-0', { method: 'tunai', amount: 9000 }, BEFORE),
      ],
    );
    expect(report.expenses).toEqual({ count: 2, amount: 20000 });
    expect(report.returns).toEqual({ count: 3, amount: 50000 });
    const find = (key: string) => report.byMethod.find((item) => item.key === key);
    expect(find('tunai:')).toMatchObject({ returns: 1, refunded: 30000 });
    expect(find('transfer:BCA')).toMatchObject({ returns: 1, refunded: 20000, receipts: 2 });
    expect(find('retur:')).toMatchObject({ method: 'retur', returns: 1, refunded: 0, receipts: 0 });
  });

  it('retur pada metode tanpa penerimaan tetap membuat barisnya', () => {
    const report = buildShiftReport(
      SHIFT,
      [],
      [],
      [],
      [returned('R-1', { method: 'qris', amount: 7000, channel: 'OVO' })],
    );
    expect(report.byMethod).toEqual([
      expect.objectContaining({
        key: 'qris:OVO',
        receipts: 0,
        amount: 0,
        returns: 1,
        refunded: 7000,
      }),
    ]);
  });
});

describe('methodTransactions', () => {
  const RETURNS: readonly ReturnRecord[] = [
    returned('R-1', { method: 'tunai', amount: 30000 }, '2026-11-07T02:30:00.000Z'),
    returned(
      'R-2',
      { method: 'transfer', amount: 20000, channel: 'BCA' },
      '2026-11-07T02:40:00.000Z',
    ),
    returned('R-3', undefined, '2026-11-07T02:50:00.000Z', 15000),
    returned('R-0', { method: 'tunai', amount: 9000 }, BEFORE),
  ];

  it('memuat penerimaan dan retur metode itu dalam rentang shift, berurutan menurut waktu', () => {
    const rows = methodTransactions(
      { startedAt: SHIFT.startedAt },
      'tunai:',
      SALES,
      DEVICE,
      RETURNS,
    );
    expect(rows).toEqual([
      { kind: 'penerimaan', reference: 'T-1', at: AFTER, amount: 70000 },
      { kind: 'penerimaan', reference: 'T-2', at: AFTER, amount: 30000 },
      { kind: 'penerimaan', reference: 'T-5', at: AFTER, amount: 20000 },
      { kind: 'retur', reference: 'R-1', at: '2026-11-07T02:30:00.000Z', amount: 30000 },
    ]);
    const bca = methodTransactions(
      { startedAt: SHIFT.startedAt },
      'transfer:BCA',
      SALES,
      DEVICE,
      RETURNS,
    );
    expect(bca.map((row) => `${row.kind}:${row.reference}:${String(row.amount)}`)).toEqual([
      'penerimaan:T-2:40000',
      'penerimaan:T-4:10000',
      'retur:R-2:20000',
    ]);
  });

  it('jumlah baris sama dengan rekap laporan untuk setiap kunci', () => {
    const report = buildShiftReport(SHIFT, SALES, DEVICE, [], RETURNS);
    for (const item of report.byMethod) {
      const rows = methodTransactions(
        { startedAt: SHIFT.startedAt },
        item.key,
        SALES,
        DEVICE,
        RETURNS,
      );
      expect(rows.filter((row) => row.kind === 'penerimaan')).toHaveLength(item.receipts);
      expect(
        rows.filter((row) => row.kind === 'penerimaan').reduce((sum, row) => sum + row.amount, 0),
      ).toBe(item.amount);
      expect(rows.filter((row) => row.kind === 'retur')).toHaveLength(item.returns);
    }
  });

  it('membatasi sampai endedAt sehingga transaksi shift berikutnya tidak ikut', () => {
    const rows = methodTransactions(
      { startedAt: SHIFT.startedAt, endedAt: '2026-11-07T01:30:00.000Z' },
      'tunai:',
      SALES,
      DEVICE,
      RETURNS,
    );
    expect(rows).toEqual([]);
  });

  it('kunci retur memuat retur tanpa pengembalian dengan nilai barangnya', () => {
    const rows = methodTransactions(
      { startedAt: SHIFT.startedAt },
      'retur:',
      SALES,
      DEVICE,
      RETURNS,
    );
    expect(rows).toEqual([
      { kind: 'retur', reference: 'R-3', at: '2026-11-07T02:50:00.000Z', amount: 15000 },
    ]);
  });

  it('kunci yang tidak dikenal menghasilkan daftar kosong', () => {
    expect(
      methodTransactions({ startedAt: SHIFT.startedAt }, 'edc:', SALES, DEVICE, RETURNS),
    ).toEqual([]);
  });
});

describe('shift tertutup pada sesi', () => {
  function setup(userId = 'U-3') {
    const store = createStore({ dataset });
    store.setUser(userId);
    const session = createPosSession(store, { clock: () => 1_000_000 });
    return { store, session };
  }

  function sellOne(session: ReturnType<typeof setup>['session']): void {
    const product = dataset.products.find((item) => item.id === 'P-01');
    if (product === undefined) {
      throw new Error('barang proposal tidak ada');
    }
    session.addProduct(product, 'SAK', 1);
    session.exactAmount();
    if (session.finish() === undefined) {
      throw new Error('penjualan gagal');
    }
  }

  it('endShift menyimpan ClosedShift berstatus belum dan mengosongkan shift', () => {
    const { session } = setup();
    session.startShift(100000);
    sellOne(session);
    session.saveExpense('bensin', '', 10000);
    expect(session.endShift(150000)).toMatchObject({ closingCash: 160000 });
    expect(session.state().shift).toBeUndefined();
    const [closed] = session.state().closedShifts;
    expect(closed).toMatchObject({
      id: 'SH-1',
      userId: 'U-3',
      openingCash: 100000,
      expectedCash: 160000,
      countedCash: 150000,
      difference: -10000,
      review: { status: 'belum' },
    });
    expect(closed?.report.receipts).toEqual({ count: 1, amount: 70000 });
    expect(closed?.report.expenses).toEqual({ count: 1, amount: 10000 });
    expect(closed?.endedAt).toBeTruthy();
    session.startShift(0);
    session.endShift();
    expect(session.state().closedShifts.map((shift) => shift.id)).toEqual(['SH-1', 'SH-2']);
  });

  it('endShift tanpa angka hitungan memakai saldo harapan sehingga selisih nol', () => {
    const { session } = setup();
    session.startShift(100000);
    sellOne(session);
    session.endShift();
    expect(session.state().closedShifts[0]).toMatchObject({
      expectedCash: 170000,
      countedCash: 170000,
      difference: 0,
    });
  });

  it('hitungan nol atau lebih besar dari saldo tidak merusak laporan, dan angka tak sah dianggap tanpa hitungan', () => {
    const lower = setup();
    lower.session.startShift(100000);
    sellOne(lower.session);
    lower.session.endShift(0);
    expect(lower.session.state().closedShifts[0]).toMatchObject({
      countedCash: 0,
      difference: -170000,
    });
    const higher = setup();
    higher.session.startShift(100000);
    sellOne(higher.session);
    higher.session.endShift(999_999_999);
    expect(higher.session.state().closedShifts[0]?.difference).toBe(999_999_999 - 170000);
    expect(higher.session.state().closedShifts[0]?.report.receipts.amount).toBe(70000);
    const invalid = setup();
    invalid.session.startShift(50000);
    invalid.session.endShift(Number.NaN);
    expect(invalid.session.state().closedShifts[0]).toMatchObject({
      countedCash: 50000,
      difference: 0,
    });
    const negative = setup();
    negative.session.startShift(50000);
    negative.session.endShift(-5);
    expect(negative.session.state().closedShifts[0]?.difference).toBe(0);
  });

  it('ClosedShift.counted membedakan hitungan yang dimasukkan dari hitungan yang dilewati', () => {
    const entered = setup();
    entered.session.startShift(50000);
    entered.session.endShift(40000);
    expect(entered.session.state().closedShifts[0]?.counted).toBe(true);
    const zero = setup();
    zero.session.startShift(50000);
    zero.session.endShift(0);
    expect(zero.session.state().closedShifts[0]?.counted).toBe(true);
    for (const skipped of [undefined, Number.NaN, -5]) {
      const { session } = setup();
      session.startShift(50000);
      session.endShift(skipped);
      expect(session.state().closedShifts[0]).toMatchObject({ counted: false, difference: 0 });
    }
  });

  it('endShift tanpa shift berjalan tidak menyimpan apa pun', () => {
    const { session } = setup();
    expect(session.endShift(1000)).toBeUndefined();
    expect(session.state().closedShifts).toEqual([]);
  });

  it('ringkasan dan laporan shift berjalan dihitung tanpa menutup shift', () => {
    const { session } = setup();
    expect(session.shiftReport()).toBeUndefined();
    session.startShift(100000);
    sellOne(session);
    expect(session.shiftReport()?.receipts).toEqual({ count: 1, amount: 70000 });
    expect(session.shiftSummary()?.closingCash).toBe(170000);
    expect(session.state().shift).toBeDefined();
    expect(session.state().closedShifts).toEqual([]);
  });

  it('reviewShift hanya untuk Owner dan Supervisor, sekali per shift, dan mencatat pemeriksa', () => {
    const kasir = setup('U-3');
    kasir.session.startShift(0);
    kasir.session.endShift();
    expect(kasir.session.reviewShift('SH-1')).toMatchObject({ ok: false, messageId: 'MSG-003' });
    expect(kasir.session.state().closedShifts[0]?.review).toEqual({ status: 'belum' });

    const supervisor = setup('U-2');
    supervisor.session.startShift(0);
    supervisor.session.endShift();
    expect(supervisor.session.reviewShift('SH-9')).toEqual({
      ok: false,
      labelKey: 'shiftTidakAda',
    });
    expect(supervisor.session.reviewShift('SH-1')).toEqual({ ok: true });
    expect(supervisor.session.state().closedShifts[0]?.review).toMatchObject({
      status: 'sudah',
      by: 'Ibu Sinta',
    });
    expect(supervisor.session.state().closedShifts[0]?.review.at).toBeTruthy();
    expect(supervisor.session.reviewShift('SH-1')).toEqual({
      ok: false,
      labelKey: 'shiftSudahDiperiksa',
    });

    const owner = setup('U-1');
    owner.session.startShift(0);
    owner.session.endShift();
    expect(owner.session.reviewShift('SH-1')).toEqual({ ok: true });
    expect(owner.session.state().closedShifts[0]?.review.by).toBe('Bapak Haris');
  });

  it('employees memuat owner, supervisor, kasir, dan frontliner tanpa pengguna sales', () => {
    const { session } = setup('U-2');
    const people = session.employees();
    expect(people.map((user) => user.role).sort()).toEqual([
      'frontliner',
      'kasir',
      'kasir',
      'owner',
      'supervisor',
    ]);
    expect(people.some((user) => user.role === 'sales')).toBe(false);
  });
});
