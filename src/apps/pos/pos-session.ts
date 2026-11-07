import { createEventBus } from '../../shared/store/event-bus';
import { formatDecimal, formatDocumentNumber, formatRupiah } from '../../shared/format';
import { isAllowed } from '../../shared/permissions';
import type {
  AppUser,
  ApprovalRequest,
  BillLine,
  Customer,
  HeldBill,
  PaidMethod,
  PaymentMethod,
  Product,
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
  removeLine,
  repriceLines,
  replaceLine,
  type AddResult,
} from './domain/bill';
import { DEFAULT_DUE_DAYS, MAX_DUE_DAYS, normalizePhone, type ExpenseKind } from './domain/forms';
import { dueDateOf } from './domain/terms';
import type { Failure } from './failure';
import { summarizeShift, type Shift, type ShiftSummary } from './domain/shift';
import {
  evaluatePayment,
  remainingDue,
  syncReceivableRow,
  withDownPayment,
  withMethodAmount,
  type PaymentRow,
  type PaymentSummary,
} from './domain/payment';
import {
  checkPin,
  INITIAL_GUARD,
  ownerPinOwner,
  pinBelongsToNonOwner,
  type PinGuard,
} from './domain/pin';
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
}

export interface ReturnRecord {
  readonly number: string;
  readonly saleNumber: string;
  readonly at: string;
  readonly reason: string;
  readonly value: number;
  readonly lines: readonly { readonly index: number; readonly quantity: number }[];
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

export type AuthorizePurpose = 'limit' | 'koreksi';

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
  endShift(): ShiftSummary | undefined;
  shiftSummary(): ShiftSummary | undefined;
  attemptLogin(userId: string | undefined, pin: string): FlowResult;
  logout(): void;
  addProduct(product: Product, unit?: string, quantity?: number): AddResult;
  setLine(index: number, unit: string, quantity: number): void;
  deleteLine(index: number): void;
  setCustomer(customerId: string | undefined): void;
  holdBill(): HeldBill | undefined;
  recallBill(id: string): FlowResult;
  deleteHeldBill(id: string): FlowResult;
  setMethod(method: PaymentMethod): void;
  setAmount(method: PaymentMethod, amount: number): void;
  setTerms(days: number): void;
  setDownPayment(amount: number, via: PaidMethod): void;
  chooseSingle(method: PaidMethod): void;
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
  mobileApproval(): ApprovalRequest | undefined;
  printReceipt(kind: ReceiptKind, reference: string): FlowResult;
  retryPrint(): FlowResult;
  saveExpense(kind: ExpenseKind, note: string, amount: number): FlowResult;
  registerCustomer(input: RegisterInput): RegisterResult;
  returnSale(
    saleNumber: string,
    items: readonly { readonly index: number; readonly quantity: number }[],
    reason: string,
  ): ReturnResult;
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
    endShift: () => {
      const summary = currentSummary();
      if (summary === undefined) {
        return undefined;
      }
      commit({
        shift: undefined,
        activity: [
          ...state.activity,
          entry('Selesai shift', `Saldo akhir ${formatRupiah(summary.closingCash)}`),
        ],
      });
      return summary;
    },
    attemptLogin: (userId, pin) => {
      if (userId === undefined) {
        return fail('MSG-021');
      }
      const user = userOf(userId);
      if (!user?.active) {
        return fail('MSG-020');
      }
      const outcome = checkPin(user.pin, pin, guards.get(userId) ?? INITIAL_GUARD, clock());
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
      const line = state.lines[index];
      const product = line === undefined ? undefined : products().get(line.productId);
      if (line === undefined || product === undefined) {
        return;
      }
      commit({
        lines: replaceLine(state.lines, index, {
          ...line,
          unit,
          quantity,
          unitPrice: unitPrice(product, unit, tier()),
        }),
        ownerApproved: false,
      });
    },
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
      const number = state.heldBills.length + 1;
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
    setMethod: (method) => {
      commit({ method });
    },
    setAmount: (method, amount) => {
      commit({ rows: withMethodAmount(state.rows, method, amount), ownerApproved: false });
    },
    setTerms: (days) => {
      if (!Number.isFinite(days)) {
        return;
      }
      commit({ terms: { dueDays: Math.min(MAX_DUE_DAYS, Math.max(0, Math.round(days))) } });
    },
    chooseSingle: (method) => {
      commit({
        method,
        rows: method === 'tunai' ? [] : [{ method, amount: total() }],
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
      const amount = remainingDue(total(), state.rows, state.method);
      commit({ rows: withMethodAmount(state.rows, state.method, amount) });
    },
    quickAmount: (amount) => {
      commit({ rows: withMethodAmount(state.rows, state.method, amount) });
    },
    chooseReceivable: (method) => {
      if (method === 'piutang') {
        commit({
          method,
          rows: withMethodAmount(state.rows, 'piutang', 0),
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
      if (pinBelongsToNonOwner(users, pin)) {
        return fail('MSG-050');
      }
      const owner = users.find((user) => user.role === 'owner' && user.active);
      if (owner === undefined) {
        return fail('MSG-050');
      }
      const outcome = checkPin(owner.pin, pin, ownerGuard, clock());
      ownerGuard = outcome.guard;
      if (outcome.kind === 'success' && ownerPinOwner(users, pin) !== undefined) {
        const at = stamp();
        const offline = !store.getState().online;
        const sequence = state.audit.length + 1;
        commit({
          ownerApproved: purpose === 'limit' ? true : state.ownerApproved,
          audit: [
            ...state.audit,
            { at, ownerName: owner.name, reason: reason.trim(), device: 'POS', offline },
          ],
          activity: [
            ...state.activity,
            entry(
              purpose === 'limit' ? 'Otorisasi piutang' : 'Otorisasi koreksi',
              `${reference} oleh ${owner.name}: ${reason.trim()}`,
            ),
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
        number: formatDocumentNumber('T', 101 + state.sales.length),
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
    saveExpense: (kind, note, amount) => {
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
    returnSale: (saleNumber, items, reason) => {
      if (!isAllowed(store.getState().role, 'BO-10', 'Simpan Retur')) {
        return fail('MSG-003');
      }
      const sale = state.sales.find((item) => item.number === saleNumber);
      if (sale === undefined || items.length === 0) {
        return fail('MSG-084');
      }
      for (const item of items) {
        const line = sale.lines[item.index];
        if (line === undefined) {
          return fail('MSG-084');
        }
        const room =
          Math.round((line.quantity - sumReturned(saleNumber, item.index)) * 1000) / 1000;
        if (!(item.quantity > 0)) {
          return fail('MSG-029');
        }
        if (item.quantity > room) {
          return fail('MSG-085', { jumlah: `${formatDecimal(room, 3, 1)} ${line.unit}` });
        }
      }
      if (reason.trim() === '') {
        return fail('MSG-086');
      }
      const additions: Record<string, number> = {};
      let value = 0;
      for (const item of items) {
        const line = sale.lines[item.index];
        const product = line === undefined ? undefined : products().get(line.productId);
        if (line !== undefined && product !== undefined) {
          additions[product.id] =
            (additions[product.id] ?? 0) + toBase(product, line.unit, item.quantity);
          value += Math.round(item.quantity * line.unitPrice);
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
            reason: reason.trim(),
            value,
            lines: items.map((item) => ({ index: item.index, quantity: item.quantity })),
          },
        ],
        activity: [...state.activity, entry('Retur penjualan', `${number} untuk ${saleNumber}`)],
      });
      return { ok: true, number, value };
    },
    syncNow: () => {
      if (!store.getState().online) {
        return fail('MSG-047');
      }
      runSync();
      return { ok: true };
    },
  };
}
