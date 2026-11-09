import { balanceOf, outstanding, wibDate } from '../../shared/data/receivable';
import type {
  Customer,
  PaymentMethod,
  Product,
  PurchaseOrder,
  SalesOrder,
  WarehouseId,
} from '../../shared/data/types';
import { round3, toBase } from '../../shared/data/units';
import { formatRupiah, formatTime } from '../../shared/format';
import { isAllowed } from '../../shared/permissions';
import type { LabelKey, MessageValues, SystemMessageId } from '../../shared/messages';
import { INITIAL_GUARD, type PinGuard } from '../../shared/domain/pin';
import { parseQuantity, validateTransfer } from '../../shared/domain/transfer';
import { createEventBus } from '../../shared/store/event-bus';
import type { Store } from '../../shared/store/store';
import { checkApproval, KIND_TEXT } from './domain/approval';
import { checkOwnerLogin, createMemoryVault, type SessionVault } from './domain/auth';
import { OWNER_DEVICE, OWNER_IP, REFRESH_MS, SESSION_DAYS, SYNC_STEP_MS } from './domain/constants';
import {
  buildNotification,
  NOTIFICATION_KINDS,
  type NotificationKind,
  type OwnerNotification,
} from './domain/notifications';
import {
  checkPurchaseOrder,
  checkSalesOrder,
  type PurchaseOrderDraft,
  type SalesOrderDraft,
} from './domain/orders';
import { applyPayablePayment, supplierBalance, validatePayablePayment } from './domain/payables';
import { applyPayment, validatePayment } from './domain/receivables';

export type QueueStatus = 'menunggu' | 'mengirim' | 'terkirim';

export interface QueueItem {
  readonly id: string;
  readonly text: string;
  readonly at: string;
  readonly status: QueueStatus;
  readonly orderNumber?: string | undefined;
}

export interface OwnerState {
  readonly userId: string | undefined;
  readonly loadedAt: string;
  readonly lastSync: string;
  readonly syncing: boolean;
  readonly queue: readonly QueueItem[];
  readonly notifications: readonly OwnerNotification[];
  readonly push: OwnerNotification | undefined;
}

export type Failure =
  | {
      readonly ok: false;
      readonly messageId: SystemMessageId;
      readonly values: Readonly<Record<string, string | number>>;
      readonly line?: number | undefined;
    }
  | { readonly ok: false; readonly labelKey: LabelKey; readonly values?: MessageValues };

export interface Done {
  readonly ok: true;
}

export type SalesResult =
  | { readonly ok: true; readonly number: string }
  | {
      readonly ok: false;
      readonly approval: SystemMessageId;
      readonly values: Readonly<Record<string, string | number>>;
    }
  | Failure;

export type PayMethod = Exclude<PaymentMethod, 'dp' | 'piutang' | 'edc'>;

export type DocResult = { readonly ok: true; readonly number: string } | Failure;

export interface OwnerSession {
  readonly store: Store;
  now(): Date;
  state(): OwnerState;
  subscribe(listener: (state: OwnerState) => void): () => void;
  allowed(screen: string, action: string): boolean;
  signedIn(): boolean;
  login(username: string, password: string): Done | Failure;
  logout(): void;
  loadedText(): string;
  refresh(): Done | Failure;
  pending(): number;
  decide(
    id: string,
    decision: 'disetujui' | 'ditolak',
    reason: string,
    pin: string,
  ): Done | Failure;
  saveTransfer(
    productId: string,
    from: WarehouseId,
    to: WarehouseId,
    unit: string,
    quantity: string,
  ): DocResult;
  saveSalesOrder(draft: SalesOrderDraft, approval?: { reason: string; pin: string }): SalesResult;
  savePurchaseOrder(draft: PurchaseOrderDraft): DocResult;
  recordPayment(
    customerId: string,
    raw: string,
    method: PayMethod,
    invoiceId?: string,
  ): { readonly ok: true; readonly amount: number; readonly remaining: number } | Failure;
  payPayable(
    supplierId: string,
    raw: string,
    method: PayMethod,
    invoiceId?: string,
  ): { readonly ok: true; readonly amount: number; readonly remaining: number } | Failure;
  sendBill(customerId: string): { readonly ok: true; readonly queued: boolean } | Failure;
  simulatePush(kind: NotificationKind): OwnerNotification | undefined;
  markAllRead(): void;
  dismissPush(): void;
}

export interface OwnerSessionOptions {
  readonly clock?: () => number;
  readonly vault?: SessionVault;
  readonly schedule?: (run: () => void, delayMs: number) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createOwnerSession(store: Store, options: OwnerSessionOptions = {}): OwnerSession {
  const clock = options.clock ?? (() => Date.now());
  const vault = options.vault ?? createMemoryVault();
  const schedule =
    options.schedule ??
    ((run: () => void, delayMs: number): void => {
      window.setTimeout(run, delayMs);
    });
  const bus = createEventBus<{ change: OwnerState }>();
  const startedAt = clock();
  const baseMs = Date.parse(store.getState().data.referenceDate);
  const now = (): Date => new Date(baseMs + (clock() - startedAt));
  const stamp = (): string => now().toISOString();
  let guard: PinGuard = INITIAL_GUARD;
  let sequence = 0;

  const data = () => store.getState().data;
  const lookup = (id: string): Product | undefined =>
    data().products.find((item) => item.id === id);
  const customerOf = (id: string): Customer | undefined =>
    data().customers.find((item) => item.id === id);
  const role = () => store.getState().role;
  const denied = (): Failure => ({ ok: false, messageId: 'MSG-118', values: {} });

  let state: OwnerState = {
    userId: undefined,
    loadedAt: stamp(),
    lastSync: store.getState().data.referenceDate,
    syncing: false,
    queue: [],
    notifications: [],
    push: undefined,
  };

  const commit = (next: Partial<OwnerState>): void => {
    state = { ...state, ...next };
    bus.emit('change', state);
  };

  const seedNotifications = (): OwnerNotification[] =>
    NOTIFICATION_KINDS.flatMap((kind, index) => {
      sequence += 1;
      const item = buildNotification(
        kind,
        data(),
        now(),
        `N-${String(sequence)}`,
        new Date(now().getTime() - (index + 1) * 7 * 60 * 1000),
      );
      return item === undefined ? [] : [item];
    });

  const stored = vault.read();
  if (stored !== undefined && stored.expiresAt > clock()) {
    const user = data().users.find(
      (item) => item.id === stored.userId && item.active && item.role === 'owner',
    );
    if (user !== undefined) {
      store.setUser(user.id);
      state = { ...state, userId: user.id, notifications: seedNotifications() };
    }
  } else if (stored !== undefined) {
    vault.clear();
  }

  const log = (kind: Parameters<Store['logActivity']>[0]['kind'], detail: string): void => {
    store.logActivity({
      at: stamp(),
      userId: state.userId ?? store.getState().userId,
      device: OWNER_DEVICE,
      ip: OWNER_IP,
      kind,
      detail,
    });
  };

  const enqueue = (text: string, orderNumber?: string): void => {
    if (store.getState().online) {
      return;
    }
    sequence += 1;
    commit({
      queue: [
        ...state.queue,
        { id: `Q-${String(sequence)}`, text, at: stamp(), status: 'menunggu', orderNumber },
      ],
    });
  };

  const step = (): void => {
    if (!store.getState().online) {
      commit({ syncing: false });
      return;
    }
    const next = state.queue.find((item) => item.status === 'menunggu');
    if (next === undefined) {
      commit({ syncing: false, lastSync: stamp(), loadedAt: stamp() });
      return;
    }
    commit({
      queue: state.queue.map((item) =>
        item.id === next.id ? { ...item, status: 'mengirim' } : item,
      ),
    });
    schedule(() => {
      commit({
        queue: state.queue.map((item) =>
          item.id === next.id ? { ...item, status: 'terkirim' } : item,
        ),
      });
      if (next.orderNumber !== undefined) {
        store.markSalesOrderSynced(next.orderNumber);
      }
      step();
    }, SYNC_STEP_MS);
  };

  store.bus.on('connectivity', ({ online }) => {
    if (online && state.queue.some((item) => item.status === 'menunggu') && !state.syncing) {
      commit({ syncing: true });
      schedule(step, SYNC_STEP_MS);
    }
    if (online && state.queue.length === 0) {
      commit({ loadedAt: stamp() });
    }
  });

  store.bus.on('reset', () => {
    commit({
      queue: [],
      notifications: state.userId === undefined ? [] : seedNotifications(),
      push: undefined,
    });
  });

  return {
    store,
    now,
    state: () => state,
    subscribe: (listener) => bus.on('change', listener),
    allowed: (screen, action) => isAllowed(role(), screen, action),
    signedIn: () => state.userId !== undefined,
    login: (username, password) => {
      if (!store.getState().online) {
        return { ok: false, labelKey: 'masukButuhInternet' };
      }
      const outcome = checkOwnerLogin(data().users, username, password);
      if (outcome.kind === 'error') {
        return { ok: false, messageId: outcome.messageId, values: {} };
      }
      store.setUser(outcome.user.id);
      vault.write({ userId: outcome.user.id, expiresAt: clock() + SESSION_DAYS * DAY_MS });
      commit({ userId: outcome.user.id, loadedAt: stamp(), notifications: seedNotifications() });
      log('masuk', `Masuk aplikasi Owner sebagai ${outcome.user.username}`);
      return { ok: true };
    },
    logout: () => {
      vault.clear();
      commit({ userId: undefined, queue: [], push: undefined });
    },
    loadedText: () => formatTime(new Date(state.loadedAt)),
    refresh: () => {
      if (!store.getState().online) {
        return {
          ok: false,
          messageId: 'MSG-119',
          values: { jam: formatTime(new Date(state.loadedAt)) },
        };
      }
      commit({ loadedAt: stamp() });
      return { ok: true };
    },
    pending: () => state.queue.filter((item) => item.status !== 'terkirim').length,
    decide: (id, decision, reason, pin) => {
      if (!isAllowed(role(), 'OWN-06', decision === 'disetujui' ? 'Setujui' : 'Tolak')) {
        return denied();
      }
      const request = store
        .getState()
        .approvals.find((item) => item.id === id && item.status === 'menunggu');
      if (request === undefined) {
        return denied();
      }
      const check = checkApproval(data().users, reason, pin, guard, clock());
      guard = check.guard;
      if (check.kind === 'error') {
        return { ok: false, messageId: check.messageId, values: check.values };
      }
      const offline = !store.getState().online;
      store.resolveApproval(id, decision, check.owner.id, stamp(), reason.trim());
      log(
        'otorisasi',
        `${request.reference} ${KIND_TEXT[request.kind]} ${decision} oleh ${check.owner.name}: ${reason.trim()}${offline ? ' (offline, ditinjau saat sinkron)' : ''}`,
      );
      enqueue(`Persetujuan ${request.reference}`);
      commit({});
      return { ok: true };
    },
    saveTransfer: (productId, from, to, unit, quantity) => {
      if (!isAllowed(role(), 'OWN-03', 'Buat Mutasi')) {
        return denied();
      }
      const issue = validateTransfer(from, to, [{ productId, unit, quantity }], lookup);
      if (issue !== undefined) {
        return { ok: false, messageId: issue.messageId, values: issue.values, line: issue.line };
      }
      const product = lookup(productId);
      const amount = parseQuantity(quantity);
      if (product === undefined || amount === undefined) {
        return denied();
      }
      const base = toBase(product, unit, amount);
      store.setStock(product.id, {
        ...product.stock,
        [from]: round3(product.stock[from] - base),
        [to]: round3(product.stock[to] + base),
      });
      const number = store.takeNumber('M');
      log('mutasi', `${number}: ${product.code} ${quantity} ${unit} dari ${from} ke ${to}`);
      enqueue(`Mutasi ${number}`);
      commit({});
      return { ok: true, number };
    },
    saveSalesOrder: (draft, approval) => {
      if (!isAllowed(role(), 'OWN-06', 'Buat SO')) {
        return denied();
      }
      const customer = customerOf(draft.customerId);
      const check = checkSalesOrder(draft, lookup, customer, now());
      if (check.kind === 'error') {
        return { ok: false, messageId: check.messageId, values: check.values, line: check.line };
      }
      if (!check.decision.ok) {
        if (approval === undefined) {
          return { ok: false, approval: check.decision.messageId, values: check.decision.values };
        }
        const verdict = checkApproval(data().users, approval.reason, approval.pin, guard, clock());
        guard = verdict.guard;
        if (verdict.kind === 'error') {
          return { ok: false, messageId: verdict.messageId, values: verdict.values };
        }
        log(
          'otorisasi',
          `Sales Order piutang untuk ${customer?.code ?? '-'} disetujui oleh ${verdict.owner.name}: ${approval.reason.trim()}`,
        );
      }
      const number = store.takeNumber('SO');
      const order: SalesOrder = {
        id: number,
        number,
        createdAt: stamp(),
        createdBy: state.userId ?? store.getState().userId,
        customerId: customer?.id,
        lines: check.lines,
        total: check.total,
        payment: draft.payment,
        downPayment: check.downPayment,
        status: 'draf',
        source: 'owner',
        synced: store.getState().online,
      };
      store.addSalesOrder(order);
      log('transaksi', `${number} Draf ${formatRupiah(check.total)} (${draft.payment})`);
      enqueue(`Sales Order ${number}`, number);
      commit({});
      return { ok: true, number };
    },
    savePurchaseOrder: (draft) => {
      if (!isAllowed(role(), 'OWN-06', 'Buat PO')) {
        return denied();
      }
      const check = checkPurchaseOrder(draft, lookup);
      if (check.kind === 'error') {
        return { ok: false, messageId: check.messageId, values: check.values, line: check.line };
      }
      const number = store.takeNumber('PO');
      const order: PurchaseOrder = {
        id: number,
        number,
        createdAt: stamp(),
        createdBy: state.userId ?? store.getState().userId,
        supplierId: draft.supplierId,
        warehouse: draft.warehouse === '' ? 'besar' : draft.warehouse,
        lines: check.lines,
        total: check.total,
        status: 'dipesan',
      };
      store.addPurchaseOrder(order);
      log('transaksi', `${number} Dipesan ${formatRupiah(check.total)}`);
      enqueue(`Purchase Order ${number}`);
      commit({});
      return { ok: true, number };
    },
    recordPayment: (customerId, raw, method, invoiceId) => {
      if (!isAllowed(role(), 'OWN-05', 'Catat Bayar Piutang')) {
        return denied();
      }
      const customer = customerOf(customerId);
      if (customer === undefined) {
        return denied();
      }
      const check = validatePayment(customer, raw, invoiceId);
      if (!check.ok) {
        return { ok: false, messageId: check.messageId, values: check.values };
      }
      const invoices = applyPayment(customer, check.amount, {
        firstId: invoiceId,
        record: { method, at: wibDate(now()) },
      });
      store.saveCustomer({ ...customer, invoices });
      log(
        'transaksi',
        `Pembayaran piutang ${customer.code} ${formatRupiah(check.amount)} (${method})`,
      );
      enqueue(`Pembayaran piutang ${customer.name}`);
      commit({});
      return {
        ok: true,
        amount: check.amount,
        remaining: invoices.reduce((sum, invoice) => sum + balanceOf(invoice), 0),
      };
    },
    payPayable: (supplierId, raw, method, invoiceId) => {
      // Bayar Hutang berada pada layar OWN-05 (Piutang dan Hutang) yang sama dengan Bayar Piutang.
      if (!isAllowed(role(), 'OWN-05', 'Catat Bayar Piutang')) {
        return denied();
      }
      const supplier = data().suppliers.find((item) => item.id === supplierId);
      if (supplier === undefined) {
        return denied();
      }
      const check = validatePayablePayment(supplier, raw, invoiceId);
      if (!check.ok) {
        return 'messageId' in check
          ? { ok: false, messageId: check.messageId, values: check.values }
          : { ok: false, labelKey: check.labelKey, values: check.values };
      }
      const updated = applyPayablePayment(supplier, check.amount, {
        firstId: invoiceId,
        record: { method, at: wibDate(now()) },
      });
      store.saveSupplier(updated);
      log(
        'transaksi',
        `Pembayaran hutang ${supplier.name} ${formatRupiah(check.amount)} (${method})`,
      );
      enqueue(`Pembayaran hutang ${supplier.name}`);
      commit({});
      return { ok: true, amount: check.amount, remaining: supplierBalance(updated) };
    },
    sendBill: (customerId) => {
      if (!isAllowed(role(), 'OWN-05', 'Kirim Tagihan WA (PDF)')) {
        return denied();
      }
      const customer = customerOf(customerId);
      if (customer === undefined) {
        return denied();
      }
      const online = store.getState().online;
      log(
        'cetak',
        `Tagihan PDF ${customer.code} sisa ${formatRupiah(outstanding(customer))} dikirim via WA (simulasi)${online ? '' : ', menunggu sinkron'}`,
      );
      enqueue(`Tagihan WA ${customer.name}`);
      commit({});
      return { ok: true, queued: !online };
    },
    simulatePush: (kind) => {
      if (!isAllowed(role(), 'OWN-06', 'Notifikasi')) {
        return undefined;
      }
      sequence += 1;
      const item = buildNotification(kind, data(), now(), `N-${String(sequence)}`);
      if (item === undefined) {
        return undefined;
      }
      commit({ notifications: [item, ...state.notifications], push: item });
      return item;
    },
    markAllRead: () => {
      commit({ notifications: state.notifications.map((item) => ({ ...item, read: true })) });
    },
    dismissPush: () => {
      commit({ push: undefined });
    },
  };
}

export { REFRESH_MS };
