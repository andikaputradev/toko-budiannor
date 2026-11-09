import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Product } from '../../../src/shared/data/types';
import { INITIAL_GUARD } from '../../../src/shared/domain/pin';
import { createStore } from '../../../src/shared/store/store';
import {
  buildDoc,
  checkOwnerPin,
  createCorrectionLedger,
  evaluateLine,
  formatCorrectionNumber,
  ledgerFor,
  needsOwnerPin,
  OWNER_PIN_LIMIT,
  planCorrection,
  seedCorrections,
  stockAfter,
  warehousesOf,
  type CorrectionDraftLine,
} from '../../../src/apps/bo/domain/stock-correction';
import { need, sampleProduct } from './support';

const dataset = generateDataset();
// Semen: satuan dasar Kg dan Sak (1 Sak = 40 Kg), HPP per Kg.
const semen: Product = { ...sampleProduct(), stock: { display: 10, besar: 80 }, hpp: 1500 };
const lookup = (id: string): Product | undefined => (id === semen.id ? semen : undefined);

function draft(overrides: Partial<CorrectionDraftLine> = {}): CorrectionDraftLine {
  return { productId: semen.id, warehouse: 'besar', unit: 'Sak', actual: '3', ...overrides };
}

describe('evaluateLine', () => {
  it('menghitung selisih dalam satuan dasar dan satuan terpilih beserta nilainya', () => {
    const result = evaluateLine(semen, draft(), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.line).toMatchObject({
      systemBase: 80,
      actualBase: 120,
      diffBase: 40,
      systemQty: 2,
      actualQty: 3,
      diffQty: 1,
      value: 60000,
    });
  });

  it('memberi selisih negatif bila stok sebenarnya lebih kecil dan menerima koma desimal', () => {
    const result = evaluateLine(semen, draft({ actual: '1,5' }), 0);
    expect(result.ok && result.line.diffBase).toBe(-20);
    expect(result.ok && result.line.value).toBe(-30000);
  });

  it('menolak isian kosong, bukan angka, negatif, dan lebih dari tiga desimal', () => {
    const issue = (actual: string) => {
      const result = evaluateLine(semen, draft({ actual }), 4);
      return result.ok ? undefined : result.issue;
    };
    expect(issue('')).toMatchObject({ messageId: 'MSG-074', line: 4, field: 'actual' });
    expect(issue('abc')).toMatchObject({ messageId: 'MSG-030' });
    expect(issue('-1')).toMatchObject({ messageId: 'MSG-075' });
    expect(issue('1,2345')).toMatchObject({ messageId: 'MSG-031' });
  });

  it('menolak pecahan pada barang yang hanya dijual bulat dan satuan yang tidak dikenal', () => {
    const whole: Product = { ...semen, allowDecimal: false };
    expect(evaluateLine(whole, draft({ actual: '2,5' }), 0)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-032' },
    });
    expect(evaluateLine(semen, draft({ unit: 'Truk' }), 0)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-030' },
    });
  });

  it('menerima stok sebenarnya nol sebagai pengosongan stok', () => {
    const result = evaluateLine(semen, draft({ actual: '0' }), 0);
    expect(result.ok && result.line.diffBase).toBe(-80);
  });
});

describe('planCorrection', () => {
  const reason = 'Barang rusak saat bongkar';

  it('menolak dokumen tanpa baris dan barang yang tidak dikenal', () => {
    expect(planCorrection([], reason, lookup)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-073' },
    });
    expect(planCorrection([draft({ productId: 'P-X' })], reason, lookup)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-006', line: 0 },
    });
  });

  it('menolak barang dan gudang yang sama dua kali, tetapi mengizinkan gudang berbeda', () => {
    expect(planCorrection([draft(), draft()], reason, lookup)).toMatchObject({
      ok: false,
      issue: { labelKey: 'korBarisGanda', line: 1, field: 'duplicate' },
    });
    const both = planCorrection(
      [draft(), draft({ warehouse: 'display', actual: '1' })],
      reason,
      lookup,
    );
    expect(both.ok).toBe(true);
  });

  it('mewajibkan alasan minimal lima karakter setelah baris valid', () => {
    expect(planCorrection([draft()], 'abc', lookup)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-082', field: 'reason' },
    });
    expect(planCorrection([draft()], '   ', lookup)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-082' },
    });
  });

  it('melaporkan galat baris sebelum galat alasan', () => {
    expect(planCorrection([draft({ actual: '' })], '', lookup)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-074' },
    });
  });

  it('menolak dokumen yang semua barisnya tanpa selisih', () => {
    expect(planCorrection([draft({ actual: '2' })], reason, lookup)).toMatchObject({
      ok: false,
      issue: { messageId: 'MSG-076', field: 'nodiff' },
    });
  });

  it('hanya menyimpan baris berselisih dan menjumlahkan nilai bertanda serta nilai mutlak', () => {
    const plan = planCorrection(
      [draft(), draft({ warehouse: 'display', actual: '0' })],
      reason,
      lookup,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.lines).toHaveLength(2);
    expect(plan.changed).toHaveLength(2);
    expect(plan.totalValue).toBe(60000 - 15000);
    expect(plan.totalAbs).toBe(60000 + 15000);
  });

  it('melewatkan baris tanpa selisih dari baris yang disimpan', () => {
    const plan = planCorrection(
      [draft({ actual: '2' }), draft({ warehouse: 'display', actual: '1' })],
      reason,
      lookup,
    );
    expect(plan.ok && plan.changed.map((line) => line.warehouse)).toEqual(['display']);
    expect(plan.ok && plan.lines).toHaveLength(2);
  });
});

describe('otorisasi koreksi', () => {
  it('Owner tidak perlu PIN, Supervisor perlu PIN bila nilai mutlak melewati batas', () => {
    expect(needsOwnerPin('owner', OWNER_PIN_LIMIT * 10)).toBe(false);
    expect(needsOwnerPin('supervisor', OWNER_PIN_LIMIT)).toBe(false);
    expect(needsOwnerPin('supervisor', OWNER_PIN_LIMIT + 1)).toBe(true);
  });

  const users = dataset.users;
  const owner = need(users.find((user) => user.role === 'owner'));
  const supervisor = need(users.find((user) => user.role === 'supervisor'));

  it('menerima PIN Owner dan menolak PIN peran lain', () => {
    expect(checkOwnerPin(users, owner.pin, INITIAL_GUARD, 0)).toMatchObject({ kind: 'ok' });
    expect(checkOwnerPin(users, supervisor.pin, INITIAL_GUARD, 0)).toMatchObject({
      kind: 'error',
      messageId: 'MSG-050',
    });
  });

  it('menghitung sisa percobaan, memberi pesan format, lalu mengunci setelah tiga kali salah', () => {
    expect(checkOwnerPin(users, 'abc', INITIAL_GUARD, 0)).toMatchObject({ messageId: 'MSG-022' });
    const first = checkOwnerPin(users, '111111', INITIAL_GUARD, 0);
    expect(first).toMatchObject({ kind: 'error', messageId: 'MSG-049', values: { sisa: 2 } });
    const second = checkOwnerPin(users, '111111', first.guard, 1);
    const third = checkOwnerPin(users, '111111', second.guard, 2);
    expect(third).toMatchObject({ kind: 'error', messageId: 'MSG-051' });
    expect(checkOwnerPin(users, owner.pin, third.guard, 3)).toMatchObject({
      kind: 'error',
      messageId: 'MSG-051',
    });
  });
});

describe('stockAfter dan dokumen', () => {
  it('mengganti stok hanya pada gudang yang dikoreksi', () => {
    const plan = planCorrection([draft()], 'Salah hitung rak', lookup);
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(stockAfter(semen, plan.changed)).toEqual({ display: 10, besar: 120 });
    const other = need(dataset.products[1]);
    expect(stockAfter(other, plan.changed)).toEqual(other.stock);
  });

  it('menerapkan dua gudang untuk barang yang sama', () => {
    const plan = planCorrection(
      [draft(), draft({ warehouse: 'display', actual: '0' })],
      'Hitung ulang gudang',
      lookup,
    );
    expect(plan.ok && stockAfter(semen, plan.changed)).toEqual({ display: 0, besar: 120 });
  });

  it('membangun dokumen dengan total bertanda, total mutlak, dan gudang berurutan', () => {
    const plan = planCorrection(
      [draft(), draft({ warehouse: 'display', actual: '0' })],
      '  Hitung ulang gudang  ',
      lookup,
    );
    if (!plan.ok) {
      throw new Error('rencana harus valid');
    }
    const doc = buildDoc({
      number: formatCorrectionNumber(3),
      at: '2026-10-19T03:00:00.000Z',
      user: { id: 'U-2', name: 'Ibu Sinta' },
      authorizedBy: 'Bapak Haris',
      reason: '  Hitung ulang gudang  ',
      lines: plan.changed,
    });
    expect(doc).toMatchObject({
      number: 'KS-0003',
      reason: 'Hitung ulang gudang',
      authorizedBy: 'Bapak Haris',
      totalValue: 45000,
      totalAbs: 75000,
    });
    expect(warehousesOf(doc)).toEqual(['display', 'besar']);
  });
});

describe('riwayat koreksi', () => {
  it('menyemai dua dokumen contoh yang sudah tercermin pada stok sistem', () => {
    const docs = seedCorrections(dataset);
    expect(docs.map((doc) => doc.number)).toEqual(['KS-0001', 'KS-0002']);
    for (const doc of docs) {
      expect(doc.reason.length).toBeGreaterThanOrEqual(5);
      for (const line of doc.lines) {
        const product = need(dataset.products.find((item) => item.id === line.productId));
        expect(line.actualBase).toBe(product.stock[line.warehouse]);
        expect(line.diffBase).not.toBe(0);
        expect(line.value).toBe(Math.round(line.diffBase * product.hpp));
      }
    }
  });

  it('menomori dokumen berikutnya, memberi tahu pendengar, dan dapat diatur ulang', () => {
    const seed = seedCorrections(dataset);
    const ledger = createCorrectionLedger(seed);
    let calls = 0;
    const stop = ledger.subscribe(() => {
      calls += 1;
    });
    expect(ledger.nextNumber()).toBe('KS-0003');
    const extra = need(seed[0]);
    ledger.add({ ...extra, number: ledger.nextNumber() });
    expect(ledger.docs()).toHaveLength(3);
    expect(ledger.nextNumber()).toBe('KS-0004');
    ledger.reset(seed);
    expect(ledger.docs()).toHaveLength(2);
    stop();
    ledger.reset([]);
    expect(calls).toBe(2);
  });

  it('memakai satu riwayat per store dan memulihkannya saat Reset Data', () => {
    const store = createStore({ dataset });
    const ledger = ledgerFor(store);
    expect(ledgerFor(store)).toBe(ledger);
    expect(ledger.docs()).toHaveLength(2);
    ledger.add({ ...need(ledger.docs()[0]), number: ledger.nextNumber() });
    expect(ledger.docs()).toHaveLength(3);
    store.resetData();
    expect(ledger.docs()).toHaveLength(2);
    expect(ledgerFor(createStore({ dataset }))).not.toBe(ledger);
  });
});
