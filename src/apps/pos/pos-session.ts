import { createEventBus } from '../../shared/store/event-bus';
import { formatDecimal, formatDocumentNumber, formatRupiah } from '../../shared/format';
import { accessFor, isAllowed } from '../../shared/permissions';
import type {
  AppUser,
  ApprovalRequest,
  BillLine,
  Customer,
  HeldBill,
  LineDiscount,
  PaidMethod,
  PaymentMethod,
  Product,
  RefundMethod,
  Sale,
  SyncItem,
  SyncKind,
  Tier,
} from '../../shared/data/types';
import { toBase, unitPrice } from '../../shared/data/units';
import { label, type LabelKey, type SystemMessageId } from '../../shared/messages';
import type { Store } from '../../shared/store/store';
import {
  addLine,
  billTotal,
  defaultUnitOf,
  MAX_BILL_LINES,
  mergeLines,
  removeLine,
  repriceLines,
  replaceLine,
  splitLines,
  validateDiscount,
  type AddResult,
  type SplitPick,
} from './domain/bill';
import {
  DEFAULT_DUE_DAYS,
  EXPENSE_NOTE_MAX,
  MAX_DUE_DAYS,
  normalizePhone,
  type ExpenseKind,
} from './domain/forms';
import { dueDateOf } from './domain/terms';
import {
  itemsValue,
  reasonText,
  validateRefundAmount,
  type ReturnInput,
  type ReturReason,
} from './domain/retur';
import type { Failure } from './failure';
import { summarizeShift, type Shift, type ShiftSummary } from './domain/shift';
import { buildShiftReport, type ClosedShift, type ShiftReport } from './domain/shift-report';
import {
  evaluatePayment,
  remainingDue,
  syncReceivableRow,
  withDownPayment,
  withMethodAmount,
  type PaymentRow,
  type PaymentSummary,
} from './domain/payment';
import { isValidChannel } from './domain/channels';
import { applyPart, checkPart, partLimit, type PaymentPart } from './domain/split';
import { checkPin, INITIAL_GUARD, PIN_PATTERN, type PinGuard } from './domain/pin';
import type { ReceiptKind } from './domain/receipt';

export const SYNC_STEP_MS = 400;
export const INITIAL_SYNC_AT = '2026-10-17T07:20:00.000Z';

export interface AuditEntry {
  readonly at: string;
  readonly ownerName: string;
  readonly reason: string;
  readonly device: string;
  readonly offline: boolean;
}

export interface ActivityEntry {
  readonly at: string;
  readonly user: string;
  readonly action: string;
  readonly detail: string;
}

export interface Expense {
  readonly id: string;
  readonly at: string;
  readonly userId: string;
  readonly kind: ExpenseKind;
  readonly note: string;
  readonly amount: number;
  // Lampiran Catat Biaya: hanya nama dan ukuran yang dicatat (mockup tanpa unggah sungguhan).
  readonly attachment?: { readonly name: string; readonly size: number } | undefined;
}

export interface ReturnRecord {
  readonly number: string;
  readonly saleNumber: string;
  readonly at: string;
  readonly reason: string;
  readonly value: number;
  readonly lines: readonly { readonly index: number; readonly quantity: number }[];
  readonly reasonKind?: ReturReason | undefined;
  readonly refund?:
    | {
        readonly method: RefundMethod;
        readonly amount: number;
        readonly channel?: string | undefined;
      }
    | undefined;
  readonly photoName?: string | undefined;
}

export interface PosState {
  readonly loggedIn: boolean;
  readonly customerId: string | undefined;
  readonly lines: readonly BillLine[];
  readonly rows: readonly PaymentRow[];
  readonly method: PaymentMethod;
  readonly ownerApproved: boolean;
  readonly billRef: string | undefined;
  readonly terms: { readonly dueDays: number } | undefined;
  readonly heldBills: readonly HeldBill[];
  readonly sales: readonly Sale[];
  readonly deviceSales: readonly string[];
  readonly queue: readonly SyncItem[];
  readonly audit: readonly AuditEntry[];
  readonly activity: readonly ActivityEntry[];
  readonly expenses: readonly Expense[];
  readonly returns: readonly ReturnRecord[];
  readonly syncing: { readonly current: number; readonly total: number } | undefined;
  readonly lastSync: string;
  readonly lastConnected: string;
  readonly printPending: string | undefined;
  readonly shift: Shift | undefined;
  readonly closedShifts: readonly ClosedShift[];
  // PIN yang diganti lewat Pengaturan (id pengguna ke PIN baru); hanya hidup selama sesi aplikasi.
  readonly pins: Readonly<Record<string, string>>;
  readonly channel: string | undefined;
}

export type FlowResult = { readonly ok: true } | Failure;

export interface LabelFailure {
  readonly ok: false;
  readonly labelKey: LabelKey;
}
export type ShiftResult = { readonly ok: true } | LabelFailure;

export type RegisterResult =
  | { readonly ok: true; readonly customer: Customer }
  | {
      readonly ok: false;
      readonly field: 'name' | 'phone' | 'limit' | 'duplicate';
      readonly messageId: SystemMessageId;
    };

export type ReturnResult =
  { readonly ok: true; readonly number: string; readonly value: number } | Failure;

export interface RegisterInput {
  readonly name: string;
  readonly phone: string;
  readonly address: string;
  readonly tier: Tier;
  readonly limit: number;
  readonly dueDays: number;
}

export type AuthorizePurpose = 'limit' | 'koreksi' | 'harga';

// Perubahan pada satu baris pesanan dari Detail Barang. null menghapus diskon atau memulihkan
// harga asli; kunci yang tidak ada dibiarkan seperti semula.
export interface LineDetailPatch {
  unit?: string;
  quantity?: number;
  discount?: LineDiscount | null;
  price?: number | null;
  note?: string;
  sellerId?: string | null;
}

export interface PosSession {
  readonly store: Store;
  now(): Date;
  state(): PosState;
  subscribe(listener: (state: PosState) => void): () => void;
  product(id: string): Product | undefined;
  customer(): Customer | undefined;
  customerName(id: string | undefined): string;
  userName(id: string): string;
  total(): number;
  summary(): PaymentSummary;
  pendingQueue(): number;
  cashBalance(): number;
  startShift(openingCash: number | undefined): ShiftResult;
  endShift(countedCash?: number): ShiftSummary | undefined;
  shiftReport(): ShiftReport | undefined;
  reviewShift(id: string): FlowResult;
  employees(): readonly AppUser[];
  shiftSummary(): ShiftSummary | undefined;
  attemptLogin(userId: string | undefined, pin: string): FlowResult;
  changePin(userId: string, oldPin: string, newPin: string): FlowResult;
  logout(): void;
  addProduct(product: Product, unit?: string, quantity?: number): AddResult;
  setLine(index: number, unit: string, quantity: number): void;
  setLineDetail(index: number, patch: LineDetailPatch, authorized?: boolean): FlowResult;
  deleteLine(index: number): void;
  setCustomer(customerId: string | undefined): void;
  holdBill(): HeldBill | undefined;
  recallBill(id: string): FlowResult;
  deleteHeldBill(id: string): FlowResult;
  splitHeldBill(id: string, picks: readonly SplitPick[]): FlowResult;
  mergeHeldBills(targetId: string, sourceId: string): FlowResult;
  setMethod(method: PaymentMethod, channel?: string): void;
  setAmount(method: PaymentMethod, amount: number, channel?: string): void;
  setPart(index: number, part: PaymentPart | undefined): void;
  setTerms(days: number): void;
  setDownPayment(amount: number, via: PaidMethod): void;
  chooseSingle(method: PaidMethod, channel?: string): void;
  exactAmount(): void;
  quickAmount(amount: number): void;
  chooseReceivable(method: 'dp' | 'piutang'): void;
  resetPayment(): void;
  authorizeOwner(
    reason: string,
    pin: string,
    purpose?: AuthorizePurpose,
    reference?: string,
  ): FlowResult;
  finish(): Sale | undefined;
  nextSaleNumber(): string;
  mobileApproval(): ApprovalRequest | undefined;
  printReceipt(kind: ReceiptKind, reference: string): FlowResult;
  retryPrint(): FlowResult;
  saveExpense(
    kind: ExpenseKind,
    note: string,
    amount: number,
    attachment?: { readonly name: string; readonly size: number },
  ): FlowResult;
  registerCustomer(input: RegisterInput): RegisterResult;
  returnSale(
    saleNumber: string,
    items: readonly { readonly index: number; readonly quantity: number }[],
    reason: string,
  ): ReturnResult;
  returnItems(saleNumber: string, input: ReturnInput): ReturnResult;
  returnedQuantity(saleNumber: string, index: number): number;
  syncNow(): FlowResult;
}

export interface PosSessionOptions {
  readonly clock?: () => number;
  readonly schedule?: (run: () => void, delayMs: number) => void;
}

const EMPTY_PAYMENT = {
  rows: [] as readonly PaymentRow[],
  method: 'tunai' as PaymentMethod,
  channel: undefined as string | undefined,
  ownerApproved: false,
  billRef: undefined as string | undefined,
  terms: undefined as { readonly dueDays: number } | undefined,
};

export function createPosSession(store: Store, options: PosSessionOptions = {}): PosSession {
  const clock = options.clock ?? (() => Date.now());
  const schedule =
    options.schedule ??
    ((run: () => void, delayMs: number): void => {
      window.setTimeout(run, delayMs);
    });
  const bus = createEventBus<{ change: PosState }>();
  const startedAt = clock();
  const baseMs = Date.parse(store.getState().data.referenceDate);
  const now = (): Date => new Date(baseMs + (clock() - startedAt));
  const stamp = (): string => now().toISOString();

  const initial = (loggedIn: boolean): PosState => {
    const data = store.getState().data;
    return {
      loggedIn,
      customerId: undefined,
      lines: [],
      ...EMPTY_PAYMENT,
      heldBills: data.bills,
      sales: data.sales,
      deviceSales: [],
      queue: data.queue,
      audit: [],
      activity: [],
      expenses: [],
      returns: [],
      syncing: undefined,
      lastSync: INITIAL_SYNC_AT,
      lastConnected: data.referenceDate,
      printPending: undefined,
      shift: undefined,
      closedShifts: [],
      pins: {},
    };
  };
  let state: PosState = initial(false);
  const guards = new Map<string, PinGuard>();
  let ownerGuard: PinGuard = INITIAL_GUARD;
  let running = false;
  let cachedFor: readonly Product[] | undefined;
  let cached = new Map<string, Product>();

  const products = (): ReadonlyMap<string, Product> => {
    const current = store.getState().data.products;
    if (cachedFor !== current) {
      cachedFor = current;
      cached = new Map(current.map((product) => [product.id, product]));
    }
    return cached;
  };
  const customer = (): Customer | undefined =>
    store.getState().data.customers.find((item) => item.id === state.customerId);
  const tier = (): Tier => customer()?.tier ?? 'eceran';
  const demoNow = (): Date => new Date(store.getState().data.referenceDate);
  const total = (): number => billTotal(state.lines);
  const userName = (id: string): string =>
    store.getState().data.users.find((user) => user.id === id)?.name ?? id;
  const currentUser = (): string => userName(store.getState().userId);

  const commit = (next: Partial<PosState>): void => {
    state = { ...state, ...next };
    const lines = next.lines ?? state.lines;
    if (next.lines !== undefined || next.rows !== undefined) {
      state = { ...state, rows: syncReceivableRow(state.rows, billTotal(lines)) };
    }
    store.reportQueue(
      state.queue.filter((item) => item.status === 'menunggu' || item.status === 'mengirim').length,
    );
    bus.emit('change', state);
  };

  const MAX_NOTE = 200;

  const applyLineDetail = (
    index: number,
    patch: LineDetailPatch,
    authorized: boolean,
  ): FlowResult => {
    const line = state.lines[index];
    const product = line === undefined ? undefined : products().get(line.productId);
    if (line === undefined || product === undefined) {
      return failLabel('barisTidakAda');
    }
    const role = store.getState().role;
    const touched: readonly (readonly [string, boolean])[] = [
      ['Ubah Harga', patch.price !== undefined && patch.price !== null],
      ['Diskon', patch.discount !== undefined && patch.discount !== null],
    ];
    for (const [action, setting] of touched) {
      const removing = action === 'Ubah Harga' ? patch.price === null : patch.discount === null;
      if (!setting && !removing) {
        continue;
      }
      const access = accessFor(role, 'POS-03', action);
      if (access === 'tidak') {
        return fail('MSG-003');
      }
      if (access === 'otorisasi' && setting && !authorized) {
        return failLabel('butuhOtorisasiHarga');
      }
    }
    const unit = patch.unit ?? line.unit;
    const quantity = patch.quantity ?? line.quantity;
    if (product.prices[unit] === undefined) {
      return failLabel('barisTidakAda');
    }
    if (!Number.isFinite(quantity) || !(quantity > 0)) {
      return fail('MSG-029');
    }
    const unitChanged = unit !== line.unit;
    const tierPrice = unitPrice(product, unit, tier());
    let price = unitChanged ? tierPrice : line.unitPrice;
    let listPrice = unitChanged ? undefined : line.listPrice;
    if (patch.price === null) {
      price = tierPrice;
      listPrice = undefined;
    } else if (patch.price !== undefined) {
      if (!Number.isInteger(patch.price) || patch.price <= 0) {
        return failLabel('hargaTidakSah');
      }
      listPrice = patch.price === tierPrice ? undefined : (listPrice ?? tierPrice);
      price = patch.price;
    }
    let discount = line.discount;
    if (patch.discount === null) {
      discount = undefined;
    } else if (patch.discount !== undefined) {
      const check = validateDiscount(
        patch.discount.kind,
        patch.discount.value,
        Math.round(quantity * price),
      );
      if (check === 'negatif') {
        return failLabel('diskonNegatif');
      }
      if (check === 'melebihi') {
        return failLabel('diskonMelebihi');
      }
      discount = patch.discount.value > 0 ? patch.discount : undefined;
    }
    let note = line.note;
    if (patch.note !== undefined) {
      const trimmed = patch.note.trim();
      if (trimmed.length > MAX_NOTE) {
        return failLabel('catatanTerlaluPanjang');
      }
      note = trimmed === '' ? undefined : trimmed;
    }
    let sellerId = line.sellerId;
    if (patch.sellerId === null) {
      sellerId = undefined;
    } else if (patch.sellerId !== undefined) {
      const seller = store
        .getState()
        .data.users.find((user) => user.id === patch.sellerId && user.active);
      if (seller === undefined || (seller.role !== 'frontliner' && seller.role !== 'sales')) {
        return failLabel('tenagaPenjualTidakSah');
      }
      sellerId = seller.id;
    }
    commit({
      lines: replaceLine(state.lines, index, {
        productId: line.productId,
        unit,
        quantity,
        unitPrice: price,
        ...(discount === undefined ? {} : { discount }),
        ...(listPrice === undefined ? {} : { listPrice }),
        ...(note === undefined ? {} : { note }),
        ...(sellerId === undefined ? {} : { sellerId }),
      }),
      ownerApproved: false,
    });
    return { ok: true };
  };

  // Urutan bill berikutnya: satu di atas nomor terbesar yang ada, sehingga id dan nomor tidak
  // kembar walau bill lain sudah dihapus.
  const nextBillSequence = (): number =>
    state.heldBills.reduce(
      (max, bill) =>
        Math.max(max, Number(bill.id.slice(2)) || 0, Number(bill.number.slice(2)) || 0),
      0,
    ) + 1;

  const nextSaleNumber = (): string => formatDocumentNumber('T', 101 + state.sales.length);

  const mobileApproval = (): ApprovalRequest | undefined =>
    state.billRef === undefined
      ? undefined
      : store
          .getState()
          .approvals.find(
            (item) =>
              item.kind === 'piutang' &&
              item.status === 'disetujui' &&
              item.reference === state.billRef,
          );

  const summary = (): PaymentSummary =>
    evaluatePayment({
      total: total(),
      rows: state.rows,
      customer: customer(),
      now: demoNow(),
      ownerApproved: state.ownerApproved || mobileApproval() !== undefined,
    });

  const userOf = (userId: string | undefined): AppUser | undefined =>
    store.getState().data.users.find((user) => user.id === userId);

  // PIN berlaku: yang diganti di Pengaturan bila ada, kalau tidak PIN data awal.
  const pinOf = (user: AppUser): string => state.pins[user.id] ?? user.pin;

  const fail = (
    messageId: SystemMessageId,
    values: Readonly<Record<string, string | number>> = {},
  ): {
    readonly ok: false;
    readonly messageId: SystemMessageId;
    readonly values: typeof values;
  } => ({
    ok: false,
    messageId,
    values,
  });

  const failLabel = (labelKey: LabelKey): LabelFailure => ({ ok: false, labelKey });

  const entry = (action: string, detail: string): ActivityEntry => ({
    at: stamp(),
    user: currentUser(),
    action,
    detail,
  });

  const currentSummary = (): ShiftSummary | undefined =>
    state.shift === undefined
      ? undefined
      : summarizeShift(state.shift, state.sales, state.deviceSales, state.expenses, state.returns);

  const queued = (
    kind: SyncKind,
    reference: string,
    amount: number,
    at: string,
  ): readonly SyncItem[] =>
    store.getState().online
      ? state.queue
      : [
          ...state.queue,
          {
            id: `Q-${String(state.queue.length + 1)}`,
            saleNumber: reference,
            createdAt: at,
            status: 'menunggu',
            kind,
            total: amount,
          },
        ];

  const mark = (id: string, status: SyncItem['status']): readonly SyncItem[] =>
    state.queue.map((item) => (item.id === id ? { ...item, status } : item));

  const runSync = (): void => {
    if (running) {
      return;
    }
    const pending = state.queue.filter((item) => item.status === 'menunggu');
    if (pending.length === 0) {
      return;
    }
    running = true;
    const finishRun = (): void => {
      running = false;
      commit({ syncing: undefined, lastSync: stamp() });
    };
    const step = (index: number): void => {
      const item = pending[index];
      if (item === undefined) {
        finishRun();
        return;
      }
      commit({
        queue: mark(item.id, 'mengirim'),
        syncing: { current: index + 1, total: pending.length },
      });
      schedule(() => {
        if (!store.getState().online) {
          running = false;
          commit({ queue: mark(item.id, 'menunggu'), syncing: undefined });
          return;
        }
        commit({ queue: mark(item.id, 'terkirim') });
        step(index + 1);
      }, SYNC_STEP_MS);
    };
    step(0);
  };

  store.bus.on('connectivity', ({ online }) => {
    commit({ lastConnected: stamp() });
    if (online) {
      runSync();
    }
  });
  store.bus.on('reset', () => {
    running = false;
    state = initial(state.loggedIn);
    bus.emit('change', state);
  });

  const sumReturned = (saleNumber: string, index: number): number =>
    state.returns
      .filter((record) => record.saleNumber === saleNumber)
      .reduce(
        (sum, record) => sum + (record.lines.find((line) => line.index === index)?.quantity ?? 0),
        0,
      );

  const returnItems = (saleNumber: string, input: ReturnInput): ReturnResult => {
    if (!isAllowed(store.getState().role, 'BO-10', 'Simpan Retur')) {
      return fail('MSG-003');
    }
    const sale = state.sales.find((item) => item.number === saleNumber);
    if (sale === undefined || input.items.length === 0) {
      return fail('MSG-084');
    }
    for (const item of input.items) {
      const line = sale.lines[item.index];
      if (line === undefined) {
        return fail('MSG-084');
      }
      const room = Math.round((line.quantity - sumReturned(saleNumber, item.index)) * 1000) / 1000;
      if (!(item.quantity > 0)) {
        return fail('MSG-029');
      }
      if (item.quantity > room) {
        return fail('MSG-085', { jumlah: `${formatDecimal(room, 3, 1)} ${line.unit}` });
      }
    }
    if (input.reason === 'lainnya' && input.note.trim() === '') {
      return fail('MSG-086');
    }
    const additions: Record<string, number> = {};
    for (const item of input.items) {
      const line = sale.lines[item.index];
      const product = line === undefined ? undefined : products().get(line.productId);
      if (line !== undefined && product !== undefined) {
        additions[product.id] =
          (additions[product.id] ?? 0) + toBase(product, line.unit, item.quantity);
      }
    }
    const value = itemsValue(sale, input.items);
    const refund = input.refund;
    if (refund !== undefined) {
      if (!isValidChannel(refund.method, refund.channel)) {
        return failLabel('kanalTidakSah');
      }
      const check = validateRefundAmount(refund.amount, value);
      if (check === 'not-positive') {
        return fail('MSG-029');
      }
      if (check === 'too-high') {
        return failLabel('nominalMelebihi');
      }
      if (refund.method === 'tunai') {
        const summary = currentSummary();
        if (summary === undefined) {
          return failLabel('butuhShift');
        }
        if (refund.amount > summary.closingCash) {
          return fail('MSG-041', { saldo: formatRupiah(summary.closingCash) });
        }
      }
    }
    const number = formatDocumentNumber('R', state.returns.length + 1);
    store.applyStockChange(additions);
    commit({
      returns: [
        ...state.returns,
        {
          number,
          saleNumber,
          at: stamp(),
          reason: reasonText(input.reason, input.note),
          value,
          lines: input.items.map((item) => ({ index: item.index, quantity: item.quantity })),
          reasonKind: input.reason,
          refund,
          photoName: input.photoName,
        },
      ],
      activity: [
        ...state.activity,
        entry(
          'Retur penjualan',
          refund === undefined
            ? `${number} untuk ${saleNumber}`
            : `${number} untuk ${saleNumber}, ${refund.method} ${formatRupiah(refund.amount)}`,
        ),
      ],
    });
    return { ok: true, number, value };
  };

  return {
    store,
    now,
    state: () => state,
    subscribe: (listener) => bus.on('change', listener),
    product: (id) => products().get(id),
    customer,
    customerName: (id) =>
      store.getState().data.customers.find((item) => item.id === id)?.name ??
      label('pelangganUmum'),
    userName,
    total,
    summary,
    pendingQueue: () =>
      state.queue.filter((item) => item.status === 'menunggu' || item.status === 'mengirim').length,
    cashBalance: () => currentSummary()?.closingCash ?? 0,
    shiftSummary: currentSummary,
    startShift: (openingCash) => {
      if (state.shift !== undefined) {
        return failLabel('shiftSudahBerjalan');
      }
      if (openingCash === undefined || !Number.isFinite(openingCash) || openingCash < 0) {
        return failLabel('modalWajib');
      }
      const cash = Math.round(openingCash);
      commit({
        shift: { userId: store.getState().userId, startedAt: stamp(), openingCash: cash },
        activity: [...state.activity, entry('Mulai shift', `Modal ${formatRupiah(cash)}`)],
      });
      return { ok: true };
    },
    endShift: (countedCash) => {
      const summary = currentSummary();
      const shift = state.shift;
      if (summary === undefined || shift === undefined) {
        return undefined;
      }
      // Tanpa angka hitungan (atau angka tidak sah) hitungan memakai saldo harapan: selisih nol.
      const counted =
        countedCash !== undefined && Number.isFinite(countedCash) && countedCash >= 0
          ? Math.round(countedCash)
          : summary.closingCash;
      const closed: ClosedShift = {
        id: `SH-${String(state.closedShifts.length + 1)}`,
        userId: shift.userId,
        startedAt: shift.startedAt,
        endedAt: stamp(),
        openingCash: shift.openingCash,
        expectedCash: summary.closingCash,
        countedCash: counted,
        difference: counted - summary.closingCash,
        report: buildShiftReport(
          shift,
          state.sales,
          state.deviceSales,
          state.expenses,
          state.returns,
        ),
        review: { status: 'belum' },
      };
      commit({
        shift: undefined,
        closedShifts: [...state.closedShifts, closed],
        activity: [
          ...state.activity,
          entry(
            'Selesai shift',
            `Saldo akhir ${formatRupiah(summary.closingCash)}, hitungan ${formatRupiah(counted)}`,
          ),
        ],
      });
      return summary;
    },
    shiftReport: () =>
      state.shift === undefined
        ? undefined
        : buildShiftReport(
            state.shift,
            state.sales,
            state.deviceSales,
            state.expenses,
            state.returns,
          ),
    reviewShift: (id) => {
      if (!isAllowed(store.getState().role, 'POS-11', 'Terima Laporan')) {
        return fail('MSG-003');
      }
      const target = state.closedShifts.find((item) => item.id === id);
      if (target === undefined) {
        return failLabel('shiftTidakAda');
      }
      if (target.review.status === 'sudah') {
        return failLabel('shiftSudahDiperiksa');
      }
      commit({
        closedShifts: state.closedShifts.map((item) =>
          item.id === id
            ? { ...item, review: { status: 'sudah', by: currentUser(), at: stamp() } }
            : item,
        ),
        activity: [...state.activity, entry('Terima laporan shift', id)],
      });
      return { ok: true };
    },
    employees: () =>
      store.getState().data.users.filter((user) => user.active && user.role !== 'sales'),
    attemptLogin: (userId, pin) => {
      if (userId === undefined) {
        return fail('MSG-021');
      }
      const user = userOf(userId);
      if (!user?.active) {
        return fail('MSG-020');
      }
      const outcome = checkPin(pinOf(user), pin, guards.get(userId) ?? INITIAL_GUARD, clock());
      guards.set(userId, outcome.guard);
      if (outcome.kind === 'success') {
        store.setUser(userId);
        commit({ loggedIn: true });
        return { ok: true };
      }
      if (outcome.kind === 'wrong') {
        return fail('MSG-023', { sisa: outcome.remaining });
      }
      return fail(outcome.kind === 'locked' ? 'MSG-024' : 'MSG-022');
    },
    changePin: (userId, oldPin, newPin) => {
      const user = userOf(userId);
      if (!user?.active) {
        return fail('MSG-020');
      }
      // PIN lama diperiksa dengan penjaga percobaan yang sama dengan login.
      const outcome = checkPin(pinOf(user), oldPin, guards.get(userId) ?? INITIAL_GUARD, clock());
      guards.set(userId, outcome.guard);
      if (outcome.kind === 'wrong') {
        return fail('MSG-023', { sisa: outcome.remaining });
      }
      if (outcome.kind === 'locked') {
        return fail('MSG-024');
      }
      if (outcome.kind === 'invalid-format') {
        return fail('MSG-022');
      }
      if (!PIN_PATTERN.test(newPin)) {
        return failLabel('pinBaruTidakSah');
      }
      if (newPin === oldPin) {
        return failLabel('pinBaruSamaDenganLama');
      }
      commit({
        pins: { ...state.pins, [userId]: newPin },
        activity: [...state.activity, entry('Ubah PIN', user.name)],
      });
      return { ok: true };
    },
    logout: () => {
      commit({ loggedIn: false, lines: [], customerId: undefined, ...EMPTY_PAYMENT });
    },
    addProduct: (product, unit, quantity = 1) => {
      const code = unit ?? defaultUnitOf(product).code;
      const result = addLine(state.lines, {
        productId: product.id,
        unit: code,
        quantity,
        unitPrice: unitPrice(product, code, tier()),
      });
      if (result.ok) {
        commit({ lines: result.lines, ownerApproved: false });
      }
      return result;
    },
    setLine: (index, unit, quantity) => {
      applyLineDetail(index, { unit, quantity }, true);
    },
    setLineDetail: (index, patch, authorized = false) => applyLineDetail(index, patch, authorized),
    deleteLine: (index) => {
      commit({ lines: removeLine(state.lines, index), ownerApproved: false });
    },
    setCustomer: (customerId) => {
      const target = store.getState().data.customers.find((item) => item.id === customerId);
      commit({
        customerId,
        lines: repriceLines(state.lines, products(), target?.tier ?? 'eceran'),
        ownerApproved: false,
        terms:
          state.terms === undefined ? undefined : { dueDays: target?.dueDays ?? DEFAULT_DUE_DAYS },
      });
    },
    holdBill: () => {
      if (state.lines.length === 0) {
        return undefined;
      }
      const number = nextBillSequence();
      const held: HeldBill = {
        id: `H-${String(number)}`,
        number: formatDocumentNumber('B', number),
        createdAt: stamp(),
        userId: store.getState().userId,
        customerId: state.customerId,
        lines: state.lines,
      };
      commit({
        heldBills: [...state.heldBills, held],
        lines: [],
        customerId: undefined,
        ...EMPTY_PAYMENT,
      });
      return held;
    },
    recallBill: (id) => {
      if (state.lines.length > 0) {
        return fail('MSG-028');
      }
      const bill = state.heldBills.find((item) => item.id === id);
      if (bill === undefined) {
        return fail('MSG-038');
      }
      commit({
        heldBills: state.heldBills.filter((item) => item.id !== id),
        lines: bill.lines,
        customerId: bill.customerId,
        ...EMPTY_PAYMENT,
        billRef: bill.number,
      });
      return { ok: true };
    },
    deleteHeldBill: (id) => {
      if (!isAllowed(store.getState().role, 'POS-05', 'Hapus Bill')) {
        return fail('MSG-003');
      }
      const bill = state.heldBills.find((item) => item.id === id);
      if (bill === undefined) {
        return fail('MSG-038');
      }
      commit({
        heldBills: state.heldBills.filter((item) => item.id !== id),
        activity: [...state.activity, entry('Hapus bill', bill.number)],
      });
      return { ok: true };
    },
    splitHeldBill: (id, picks) => {
      if (!isAllowed(store.getState().role, 'POS-05', 'Split Bill')) {
        return fail('MSG-003');
      }
      const bill = state.heldBills.find((item) => item.id === id);
      if (bill === undefined) {
        return fail('MSG-038');
      }
      const result = splitLines(bill.lines, picks);
      if ('error' in result) {
        return failLabel(
          result.error === 'kosong'
            ? 'splitKosong'
            : result.error === 'melebihi'
              ? 'splitMelebihi'
              : 'splitSemua',
        );
      }
      const sequence = nextBillSequence();
      const created: HeldBill = {
        id: `H-${String(sequence)}`,
        number: formatDocumentNumber('B', sequence),
        createdAt: stamp(),
        userId: store.getState().userId,
        customerId: bill.customerId,
        lines: result.moved,
      };
      commit({
        heldBills: [
          ...state.heldBills.map((item) =>
            item.id === id ? { ...item, lines: result.kept } : item,
          ),
          created,
        ],
        activity: [
          ...state.activity,
          entry('Split bill', `${bill.number} menjadi ${created.number}`),
        ],
      });
      return { ok: true };
    },
    mergeHeldBills: (targetId, sourceId) => {
      if (!isAllowed(store.getState().role, 'POS-05', 'Merge Bill')) {
        return fail('MSG-003');
      }
      if (targetId === sourceId) {
        return failLabel('mergeSama');
      }
      const target = state.heldBills.find((item) => item.id === targetId);
      const source = state.heldBills.find((item) => item.id === sourceId);
      if (target === undefined || source === undefined) {
        return fail('MSG-038');
      }
      const targetTier =
        store.getState().data.customers.find((item) => item.id === target.customerId)?.tier ??
        'eceran';
      const lines = repriceLines(mergeLines(target.lines, source.lines), products(), targetTier);
      if (lines.length > MAX_BILL_LINES) {
        return failLabel('mergeTerlaluBanyak');
      }
      commit({
        heldBills: state.heldBills
          .filter((item) => item.id !== sourceId)
          .map((item) => (item.id === targetId ? { ...item, lines } : item)),
        activity: [...state.activity, entry('Merge bill', `${source.number} ke ${target.number}`)],
      });
      return { ok: true };
    },
    setMethod: (method, channel) => {
      commit({ method, channel });
    },
    setAmount: (method, amount, channel) => {
      commit({
        rows: withMethodAmount(state.rows, method, amount, channel),
        ownerApproved: false,
      });
    },
    setPart: (index, part) => {
      if (part === undefined) {
        commit({ rows: applyPart(state.rows, index, undefined), ownerApproved: false });
        return;
      }
      if (!checkPart(state.rows, index, part).ok) {
        return;
      }
      const limit = partLimit(state.rows, index, part.method, total());
      const amount = limit === undefined ? part.amount : Math.min(part.amount, limit);
      if (amount > 0) {
        commit({ rows: applyPart(state.rows, index, { ...part, amount }), ownerApproved: false });
      }
    },
    setTerms: (days) => {
      if (!Number.isFinite(days)) {
        return;
      }
      commit({ terms: { dueDays: Math.min(MAX_DUE_DAYS, Math.max(0, Math.round(days))) } });
    },
    chooseSingle: (method, channel) => {
      commit({
        method,
        channel,
        rows: method === 'tunai' ? [] : withMethodAmount([], method, total(), channel),
        ownerApproved: false,
        terms: undefined,
      });
    },
    setDownPayment: (amount, via) => {
      if (!Number.isFinite(amount)) {
        return;
      }
      const capped = Math.min(Math.max(0, Math.round(amount)), total());
      commit({ rows: withDownPayment(state.rows, capped, via), ownerApproved: false });
    },
    exactAmount: () => {
      const amount = remainingDue(total(), state.rows, {
        method: state.method,
        channel: state.channel,
      });
      commit({ rows: withMethodAmount(state.rows, state.method, amount, state.channel) });
    },
    quickAmount: (amount) => {
      commit({ rows: withMethodAmount(state.rows, state.method, amount, state.channel) });
    },
    chooseReceivable: (method) => {
      if (method === 'piutang') {
        commit({
          method,
          // Hanya DP yang dibawa ke piutang; baris terbayar lain tersembunyi di panel Piutang
          // dan akan tetap dihitung sebagai uang diterima.
          rows: withMethodAmount(
            state.rows.filter((row) => row.method === 'dp'),
            'piutang',
            0,
          ),
          ownerApproved: false,
          terms: state.terms ?? { dueDays: customer()?.dueDays ?? DEFAULT_DUE_DAYS },
        });
        return;
      }
      commit({ method });
    },
    resetPayment: () => {
      commit({ ...EMPTY_PAYMENT });
    },
    authorizeOwner: (reason, pin, purpose = 'limit', reference = '') => {
      if (reason.trim().length < 5) {
        return fail('MSG-048');
      }
      const users = store.getState().data.users;
      // Perubahan harga boleh disetujui Supervisor atau Owner; tujuan lain hanya Owner.
      const mayApprove = (user: AppUser): boolean =>
        user.role === 'owner' || (purpose === 'harga' && user.role === 'supervisor');
      if (users.some((user) => pinOf(user) === pin && !mayApprove(user))) {
        return fail('MSG-050');
      }
      const approver =
        users.find((user) => user.active && mayApprove(user) && pinOf(user) === pin) ??
        users.find((user) => user.role === 'owner' && user.active);
      if (approver === undefined) {
        return fail('MSG-050');
      }
      const outcome = checkPin(pinOf(approver), pin, ownerGuard, clock());
      ownerGuard = outcome.guard;
      if (outcome.kind === 'success' && pinOf(approver) === pin && mayApprove(approver)) {
        const at = stamp();
        const offline = !store.getState().online;
        const sequence = state.audit.length + 1;
        const action =
          purpose === 'limit'
            ? 'Otorisasi piutang'
            : purpose === 'harga'
              ? 'Otorisasi harga'
              : 'Otorisasi koreksi';
        commit({
          ownerApproved: purpose === 'limit' ? true : state.ownerApproved,
          audit: [
            ...state.audit,
            { at, ownerName: approver.name, reason: reason.trim(), device: 'POS', offline },
          ],
          activity: [
            ...state.activity,
            entry(action, `${reference} oleh ${approver.name}: ${reason.trim()}`),
          ],
          queue: queued('otorisasi', formatDocumentNumber('OT', sequence), 0, at),
        });
        return { ok: true };
      }
      if (outcome.kind === 'wrong') {
        return fail('MSG-049', { sisa: outcome.remaining });
      }
      return fail(outcome.kind === 'locked' ? 'MSG-051' : 'MSG-022');
    },
    mobileApproval,
    nextSaleNumber,
    finish: () => {
      const result = summary();
      if (result.status !== 'ready') {
        return undefined;
      }
      const primary =
        state.rows.find((row) => row.method === 'piutang') ??
        state.rows.find((row) => row.method === 'dp') ??
        [...state.rows].sort((first, second) => second.amount - first.amount)[0];
      const at = stamp();
      const downPayment = state.rows
        .filter((row) => row.method === 'dp')
        .reduce((sum, row) => sum + row.amount, 0);
      const owed = state.rows.find((row) => row.method === 'piutang');
      const days = state.terms?.dueDays ?? customer()?.dueDays ?? DEFAULT_DUE_DAYS;
      const sale: Sale = {
        id: `S-${String(state.sales.length + 1)}`,
        number: nextSaleNumber(),
        createdAt: at,
        cashierId: store.getState().userId,
        customerId: state.customerId,
        lines: state.lines,
        total: result.total,
        payment: primary?.method ?? 'tunai',
        paid: Math.min(result.paid, result.total),
        payments: state.rows.map((row) => ({
          method: row.method,
          amount: row.amount,
          via: row.via,
          ...(row.channel === undefined ? {} : { channel: row.channel }),
        })),
        dp: downPayment > 0 ? downPayment : undefined,
        terms:
          owed !== undefined && owed.amount > 0
            ? { dueDays: days, dueDate: dueDateOf(now(), days) }
            : undefined,
      };
      const deductions: Record<string, number> = {};
      for (const line of state.lines) {
        const product = products().get(line.productId);
        if (product !== undefined) {
          deductions[product.id] =
            (deductions[product.id] ?? 0) - toBase(product, line.unit, line.quantity);
        }
      }
      const nextQueue = queued('transaksi', sale.number, sale.total, at);
      const fromMobile = mobileApproval();
      const usedReceivable = primary?.method === 'piutang' || primary?.method === 'dp';
      commit({
        sales: [...state.sales, sale],
        deviceSales: [...state.deviceSales, sale.number],
        queue: nextQueue,
        activity:
          fromMobile === undefined || !usedReceivable
            ? state.activity
            : [
                ...state.activity,
                entry(
                  'Otorisasi piutang dari HP',
                  `${sale.number} disetujui Owner: ${fromMobile.note ?? ''}`,
                ),
              ],
        lines: [],
        customerId: undefined,
        printPending: store.getState().printerConnected ? undefined : sale.number,
        ...EMPTY_PAYMENT,
      });
      store.applyStockChange(deductions);
      return sale;
    },
    printReceipt: (kind, reference) => {
      if (!store.getState().printerConnected) {
        return fail('MSG-040');
      }
      commit({
        printPending: state.printPending === reference ? undefined : state.printPending,
        activity:
          kind === 'copy'
            ? [...state.activity, entry('Cetak ulang struk', reference)]
            : state.activity,
      });
      return { ok: true };
    },
    retryPrint: () => {
      const pending = state.printPending;
      if (pending === undefined) {
        return { ok: true };
      }
      if (!store.getState().printerConnected) {
        return fail('MSG-018');
      }
      commit({ printPending: undefined });
      return { ok: true };
    },
    saveExpense: (kind, note, amount, attachment) => {
      const summary = currentSummary();
      if (summary === undefined) {
        return failLabel('butuhShift');
      }
      if (!(amount > 0)) {
        return fail('MSG-029');
      }
      if (kind === 'lainnya' && note.trim() === '') {
        return fail('MSG-042');
      }
      if (note.trim().length > EXPENSE_NOTE_MAX) {
        return failLabel('catatanBiayaTerlaluPanjang');
      }
      const balance = summary.closingCash;
      if (amount > balance) {
        return fail('MSG-041', { saldo: formatRupiah(balance) });
      }
      const at = stamp();
      const index = state.expenses.length + 1;
      commit({
        expenses: [
          ...state.expenses,
          {
            id: `E-${String(index)}`,
            at,
            userId: store.getState().userId,
            kind,
            note: note.trim(),
            amount,
            ...(attachment === undefined
              ? {}
              : { attachment: { name: attachment.name, size: attachment.size } }),
          },
        ],
        queue: queued('biaya', formatDocumentNumber('BY', index), amount, at),
        activity: [...state.activity, entry('Biaya kasir', `${kind} ${formatRupiah(amount)}`)],
      });
      return { ok: true };
    },
    registerCustomer: (input) => {
      const name = input.name.trim();
      if (name === '') {
        return { ok: false, field: 'name', messageId: 'MSG-043' };
      }
      const phone = normalizePhone(input.phone);
      const all = store.getState().data.customers;
      if (
        all.some(
          (item) =>
            item.name.toLowerCase() === name.toLowerCase() && normalizePhone(item.phone) === phone,
        )
      ) {
        return { ok: false, field: 'duplicate', messageId: 'MSG-045' };
      }
      if (store.getState().role === 'kasir' && input.limit > 0) {
        return { ok: false, field: 'limit', messageId: 'MSG-046' };
      }
      const count = all.length + 1;
      const created: Customer = {
        id: `C-${String(count).padStart(3, '0')}`,
        code: `C${String(count).padStart(4, '0')}`,
        name,
        phone,
        tier: input.tier,
        limit: input.limit,
        invoices: [],
        address: input.address.trim(),
        dueDays: input.dueDays,
      };
      store.addCustomer(created);
      commit({
        customerId: created.id,
        lines: repriceLines(state.lines, products(), created.tier),
        ownerApproved: false,
        queue: queued('pelanggan', created.code, 0, stamp()),
        activity: [...state.activity, entry('Pelanggan baru', created.name)],
      });
      return { ok: true, customer: created };
    },
    returnedQuantity: (saleNumber, index) => sumReturned(saleNumber, index),
    returnItems,
    returnSale: (saleNumber, items, reason) =>
      returnItems(saleNumber, { items, reason: 'lainnya', note: reason, refund: undefined }),
    syncNow: () => {
      if (!store.getState().online) {
        return fail('MSG-047');
      }
      runSync();
      return { ok: true };
    },
  };
}
