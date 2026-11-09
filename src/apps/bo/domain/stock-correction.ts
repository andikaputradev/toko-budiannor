import type {
  AppUser,
  Dataset,
  Product,
  Role,
  Stock,
  WarehouseId,
} from '../../../shared/data/types';
import { findUnit, fromBase, toBase } from '../../../shared/data/units';
import {
  checkPin,
  ownerPinOwner,
  pinBelongsToNonOwner,
  type PinGuard,
} from '../../../shared/domain/pin';
import type { LabelKey, SystemMessageId } from '../../../shared/messages';
import type { Store } from '../../../shared/store/store';
import { difference, parsePhysical } from './opname';

// Selisih nilai (mutlak, semua baris) di atas batas ini perlu PIN Owner bila yang menyimpan Supervisor.
export const OWNER_PIN_LIMIT = 2_000_000;
export const REASON_MIN = 5;

export interface CorrectionDraftLine {
  readonly productId: string;
  readonly warehouse: WarehouseId;
  readonly unit: string;
  readonly actual: string;
}

export type CorrectionIssue = (
  { readonly messageId: SystemMessageId } | { readonly labelKey: LabelKey }
) & {
  readonly line: number | undefined;
  readonly field: 'lines' | 'actual' | 'reason' | 'duplicate' | 'nodiff';
};

export interface CorrectionLine {
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly warehouse: WarehouseId;
  readonly unit: string;
  readonly baseUnit: string;
  readonly systemBase: number;
  readonly actualBase: number;
  readonly diffBase: number;
  readonly systemQty: number;
  readonly actualQty: number;
  readonly diffQty: number;
  readonly hpp: number;
  readonly value: number;
}

export type LineResult =
  | { readonly ok: true; readonly line: CorrectionLine }
  | { readonly ok: false; readonly issue: CorrectionIssue };

export type CorrectionPlan =
  | {
      readonly ok: true;
      readonly lines: readonly CorrectionLine[];
      readonly changed: readonly CorrectionLine[];
      readonly totalValue: number;
      readonly totalAbs: number;
    }
  | { readonly ok: false; readonly issue: CorrectionIssue };

export interface CorrectionDoc {
  readonly number: string;
  readonly at: string;
  readonly userId: string;
  readonly userName: string;
  readonly authorizedBy: string | undefined;
  readonly reason: string;
  readonly lines: readonly CorrectionLine[];
  readonly totalValue: number;
  readonly totalAbs: number;
}

function issueMessage(
  messageId: SystemMessageId,
  line: number | undefined,
  field: CorrectionIssue['field'],
): CorrectionIssue {
  return { messageId, line, field };
}

export function lineValue(diffBase: number, hpp: number): number {
  return Math.round(diffBase * hpp);
}

// Menghitung satu baris: stok sistem gudang dibandingkan stok sebenarnya yang diketik dalam satuan terpilih.
export function evaluateLine(
  product: Product,
  draft: CorrectionDraftLine,
  index: number,
): LineResult {
  const fail = (messageId: SystemMessageId): LineResult => ({
    ok: false,
    issue: issueMessage(messageId, index, 'actual'),
  });
  if (draft.actual.trim() === '') {
    return fail('MSG-074');
  }
  const typed = parsePhysical(draft.actual);
  if (typed === undefined) {
    return fail('MSG-030');
  }
  if (typed < 0) {
    return fail('MSG-075');
  }
  if (Math.abs(typed * 1000 - Math.round(typed * 1000)) > 1e-6) {
    return fail('MSG-031');
  }
  if (!product.allowDecimal && !Number.isInteger(typed)) {
    return fail('MSG-032');
  }
  if (findUnit(product, draft.unit) === undefined) {
    return fail('MSG-030');
  }
  const systemBase = product.stock[draft.warehouse];
  const actualBase = toBase(product, draft.unit, typed);
  const diffBase = difference(systemBase, actualBase);
  return {
    ok: true,
    line: {
      productId: product.id,
      code: product.code,
      name: product.name,
      warehouse: draft.warehouse,
      unit: draft.unit,
      baseUnit: product.baseUnit,
      systemBase,
      actualBase,
      diffBase,
      systemQty: fromBase(product, draft.unit, systemBase),
      actualQty: typed,
      diffQty: fromBase(product, draft.unit, diffBase),
      hpp: product.hpp,
      value: lineValue(diffBase, product.hpp),
    },
  };
}

export function planCorrection(
  drafts: readonly CorrectionDraftLine[],
  reason: string,
  lookup: (id: string) => Product | undefined,
): CorrectionPlan {
  if (drafts.length === 0) {
    return { ok: false, issue: issueMessage('MSG-073', undefined, 'lines') };
  }
  const seen = new Set<string>();
  const lines: CorrectionLine[] = [];
  for (const [index, draft] of drafts.entries()) {
    const product = lookup(draft.productId);
    if (product === undefined) {
      return { ok: false, issue: issueMessage('MSG-006', index, 'lines') };
    }
    const key = `${draft.productId}|${draft.warehouse}`;
    if (seen.has(key)) {
      return {
        ok: false,
        issue: { labelKey: 'korBarisGanda', line: index, field: 'duplicate' },
      };
    }
    seen.add(key);
    const result = evaluateLine(product, draft, index);
    if (!result.ok) {
      return { ok: false, issue: result.issue };
    }
    lines.push(result.line);
  }
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, issue: issueMessage('MSG-082', undefined, 'reason') };
  }
  const changed = lines.filter((line) => line.diffBase !== 0);
  if (changed.length === 0) {
    return { ok: false, issue: issueMessage('MSG-076', undefined, 'nodiff') };
  }
  return {
    ok: true,
    lines,
    changed,
    totalValue: changed.reduce((sum, line) => sum + line.value, 0),
    totalAbs: changed.reduce((sum, line) => sum + Math.abs(line.value), 0),
  };
}

export function needsOwnerPin(role: Role, totalAbs: number): boolean {
  return role !== 'owner' && totalAbs > OWNER_PIN_LIMIT;
}

export type OwnerPinResult =
  | { readonly kind: 'ok'; readonly owner: AppUser; readonly guard: PinGuard }
  | {
      readonly kind: 'error';
      readonly messageId: SystemMessageId;
      readonly values: Readonly<Record<string, number>>;
      readonly guard: PinGuard;
    };

export function checkOwnerPin(
  users: readonly AppUser[],
  pin: string,
  guard: PinGuard,
  now: number,
): OwnerPinResult {
  const owner = users.find((user) => user.role === 'owner' && user.active);
  if (owner === undefined || pinBelongsToNonOwner(users, pin)) {
    return { kind: 'error', messageId: 'MSG-050', values: {}, guard };
  }
  const outcome = checkPin(owner.pin, pin, guard, now);
  if (outcome.kind === 'success' && ownerPinOwner(users, pin) !== undefined) {
    return { kind: 'ok', owner, guard: outcome.guard };
  }
  if (outcome.kind === 'wrong') {
    return {
      kind: 'error',
      messageId: 'MSG-049',
      values: { sisa: outcome.remaining },
      guard: outcome.guard,
    };
  }
  return {
    kind: 'error',
    messageId: outcome.kind === 'locked' ? 'MSG-051' : 'MSG-022',
    values: {},
    guard: outcome.guard,
  };
}

// Stok baru satu barang setelah baris koreksi diterapkan (gudang yang tidak dikoreksi tetap).
export function stockAfter(product: Product, lines: readonly CorrectionLine[]): Stock {
  let display = product.stock.display;
  let besar = product.stock.besar;
  for (const line of lines) {
    if (line.productId !== product.id) {
      continue;
    }
    if (line.warehouse === 'display') {
      display = line.actualBase;
    } else {
      besar = line.actualBase;
    }
  }
  return { display, besar };
}

export function buildDoc(input: {
  readonly number: string;
  readonly at: string;
  readonly user: { readonly id: string; readonly name: string };
  readonly authorizedBy: string | undefined;
  readonly reason: string;
  readonly lines: readonly CorrectionLine[];
}): CorrectionDoc {
  return {
    number: input.number,
    at: input.at,
    userId: input.user.id,
    userName: input.user.name,
    authorizedBy: input.authorizedBy,
    reason: input.reason.trim(),
    lines: input.lines,
    totalValue: input.lines.reduce((sum, line) => sum + line.value, 0),
    totalAbs: input.lines.reduce((sum, line) => sum + Math.abs(line.value), 0),
  };
}

export function warehousesOf(doc: CorrectionDoc): readonly WarehouseId[] {
  const found = new Set<WarehouseId>(doc.lines.map((line) => line.warehouse));
  return (['display', 'besar'] as const).filter((warehouse) => found.has(warehouse));
}

export function formatCorrectionNumber(sequence: number): string {
  return `KS-${String(sequence).padStart(4, '0')}`;
}

export interface CorrectionLedger {
  docs(): readonly CorrectionDoc[];
  add(doc: CorrectionDoc): void;
  nextNumber(): string;
  subscribe(listener: () => void): () => void;
  reset(seed: readonly CorrectionDoc[]): void;
}

export function createCorrectionLedger(seed: readonly CorrectionDoc[]): CorrectionLedger {
  let docs: readonly CorrectionDoc[] = seed;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    docs: () => docs,
    add: (doc) => {
      docs = [...docs, doc];
      notify();
    },
    nextNumber: () => formatCorrectionNumber(docs.length + 1),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: (next) => {
      docs = next;
      notify();
    },
  };
}

function sampleLine(product: Product, warehouse: WarehouseId, systemBase: number): CorrectionLine {
  const actualBase = product.stock[warehouse];
  const diffBase = difference(systemBase, actualBase);
  return {
    productId: product.id,
    code: product.code,
    name: product.name,
    warehouse,
    unit: product.baseUnit,
    baseUnit: product.baseUnit,
    systemBase,
    actualBase,
    diffBase,
    systemQty: systemBase,
    actualQty: actualBase,
    diffQty: diffBase,
    hpp: product.hpp,
    value: lineValue(diffBase, product.hpp),
  };
}

// Dua dokumen contoh yang sudah tercermin pada stok sistem sekarang: stok sebelum koreksi
// dihitung dari stok sekarang dikurangi selisih contoh.
export function seedCorrections(data: Dataset): readonly CorrectionDoc[] {
  const candidates = data.products.filter(
    (product) =>
      product.active !== false &&
      Number.isInteger(product.stock.display) &&
      Number.isInteger(product.stock.besar) &&
      product.stock.display >= 4 &&
      product.stock.besar >= 4,
  );
  const [first, second, third] = candidates;
  const owner = data.users.find((user) => user.role === 'owner');
  const supervisor = data.users.find((user) => user.role === 'supervisor');
  if (first === undefined || second === undefined || third === undefined) {
    return [];
  }
  const rusak = sampleLine(first, 'besar', first.stock.besar + 2);
  const ditemukan = sampleLine(second, 'display', second.stock.display - 3);
  const hilang = sampleLine(third, 'display', third.stock.display + 1);
  return [
    buildDoc({
      number: formatCorrectionNumber(1),
      at: '2026-10-12T04:30:00.000Z',
      user: { id: supervisor?.id ?? 'U-2', name: supervisor?.name ?? 'Ibu Sinta' },
      authorizedBy: undefined,
      reason: 'Barang rusak saat bongkar muat di Gudang Besar',
      lines: [rusak],
    }),
    buildDoc({
      number: formatCorrectionNumber(2),
      at: '2026-10-16T03:10:00.000Z',
      user: { id: owner?.id ?? 'U-1', name: owner?.name ?? 'Bapak Haris' },
      authorizedBy: undefined,
      reason: 'Hitung ulang rak Display: satu barang ditemukan dan satu barang hilang',
      lines: [ditemukan, hilang],
    }),
  ];
}

const ledgers = new WeakMap<Store, CorrectionLedger>();

// Riwayat koreksi tinggal sepanjang sesi store; Reset Data mengembalikan dokumen contoh.
export function ledgerFor(store: Store): CorrectionLedger {
  const known = ledgers.get(store);
  if (known !== undefined) {
    return known;
  }
  const ledger = createCorrectionLedger(seedCorrections(store.getState().data));
  ledgers.set(store, ledger);
  store.bus.on('reset', () => {
    ledger.reset(seedCorrections(store.getState().data));
  });
  return ledger;
}
