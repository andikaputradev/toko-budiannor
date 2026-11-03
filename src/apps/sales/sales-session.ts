import type {
  ApprovalRequest,
  ApprovalStatus,
  PaymentMethod,
  Product,
  SalesOrder,
  Tier,
} from '../../shared/data/types';
import { formatRupiah } from '../../shared/format';
import type { LabelKey, SystemMessageId } from '../../shared/messages';
import { isAllowed } from '../../shared/permissions';
import { checkSalesOrder, preferredUnit, type OrderLineDraft } from '../../shared/domain/orders';
import { parseQuantity } from '../../shared/domain/transfer';
import { createEventBus } from '../../shared/store/event-bus';
import type { Store } from '../../shared/store/store';
import { checkSalesLogin, createMemoryVault, type SalesVault } from './domain/auth';
import { PRINTERS, SALES_DEVICE, SALES_IP, SESSION_DAYS, SYNC_STEP_MS } from './domain/constants';
import { creditWarning, type CreditWarning } from './domain/credit';

export type QueueStatus = 'menunggu' | 'mengirim' | 'terkirim';

export interface QueueItem {
  readonly id: string;
  readonly text: string;
  readonly at: string;
  readonly status: QueueStatus;
  readonly orderNumber?: string | undefined;
}

export interface DraftOrder {
  readonly customerId: string;
  readonly lines: readonly OrderLineDraft[];
  readonly payment: PaymentMethod;
  readonly downPayment: string;
}

export interface SalesState {
  readonly userId: string | undefined;
  readonly lastSync: string;
  readonly syncing: boolean;
  readonly queue: readonly QueueItem[];
  readonly printer: string | undefined;
  readonly sent: Readonly<Record<string, string>>;
  readonly draft: DraftOrder;
  readonly catalogTier: Tier;
}

export type Failure =
  | {
      readonly ok: false;
      readonly messageId: SystemMessageId;
      readonly values: Readonly<Record<string, string | number>>;
      readonly line?: number | undefined;
    }
  | { readonly ok: false; readonly labelKey: LabelKey };

export interface Done {
  readonly ok: true;
}

export type SaveResult =
  | { readonly ok: true; readonly number: string; readonly approval: boolean }
  | { readonly ok: false; readonly warning: CreditWarning }
  | Failure;

export type ApprovalView = 'tidak' | ApprovalStatus;

export const EMPTY_DRAFT: DraftOrder = {
  customerId: '',
  lines: [],
  payment: 'tunai',
  downPayment: '',
};

export interface SalesSession {
  readonly store: Store;
  readonly printers: readonly string[];
  now(): Date;
  state(): SalesState;
  subscribe(listener: (state: SalesState) => void): () => void;
  allowed(screen: string, action: string): boolean;
  signedIn(): boolean;
  userName(): string;
  login(username: string, password: string): Done | Failure;
  logout(): void;
  activate(): void;
  pending(): number;
  tier(): Tier;
  setCatalogTier(tier: Tier): void;
  setDraft(patch: Partial<DraftOrder>): void;
  addLine(product: Product, unit?: string, quantity?: string): void;
  clearDraft(): void;
  saveOrder(options?: { readonly requestApproval?: boolean }): SaveResult;
  orders(): readonly SalesOrder[];
  approvalOf(order: SalesOrder): {
    readonly status: ApprovalView;
    readonly request?: ApprovalRequest;
  };
  sendCopy(
    number: string,
    phone: string,
  ): { readonly ok: true; readonly queued: boolean } | Failure;
  printCopy(number: string): { readonly ok: true; readonly printer: string } | Failure;
  setPrinter(printer: string | undefined): void;
}

export interface SalesSessionOptions {
  readonly clock?: () => number;
  readonly vault?: SalesVault;
  readonly schedule?: (run: () => void, delayMs: number) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

export function isValidPhone(raw: string): boolean {
  return /^(08\d{7,12}|\+?628\d{7,12})$/.test(normalizePhone(raw));
}

export function createSalesSession(store: Store, options: SalesSessionOptions = {}): SalesSession {
  const clock = options.clock ?? (() => Date.now());
  const vault = options.vault ?? createMemoryVault();
  const schedule =
    options.schedule ??
    ((run: () => void, delayMs: number): void => {
      window.setTimeout(run, delayMs);
    });
  const bus = createEventBus<{ change: SalesState }>();
  const startedAt = clock();
  const baseMs = Date.parse(store.getState().data.referenceDate);
  const now = (): Date => new Date(baseMs + (clock() - startedAt));
  const stamp = (): string => now().toISOString();
  let sequence = 0;

  const data = () => store.getState().data;
  const lookup = (id: string): Product | undefined =>
    data().products.find((item) => item.id === id);
  const role = () => store.getState().role;
  const denied = (): Failure => ({ ok: false, labelKey: 'hanyaSales' });

  let state: SalesState = {
    userId: undefined,
    lastSync: store.getState().data.referenceDate,
    syncing: false,
    queue: [],
    printer: undefined,
    sent: {},
    draft: EMPTY_DRAFT,
    catalogTier: 'eceran',
  };

  const commit = (next: Partial<SalesState>): void => {
    state = { ...state, ...next };
    bus.emit('change', state);
  };

  const stored = vault.read();
  if (stored !== undefined && stored.expiresAt > clock()) {
    const user = data().users.find(
      (item) => item.id === stored.userId && item.active && item.role === 'sales',
    );
    if (user !== undefined) {
      store.setUser(user.id);
      state = { ...state, userId: user.id };
    }
  } else if (stored !== undefined) {
    vault.clear();
  }

  const userId = (): string => state.userId ?? store.getState().userId;
  const log = (kind: Parameters<Store['logActivity']>[0]['kind'], detail: string): void => {
    store.logActivity({
      at: stamp(),
      userId: userId(),
      device: SALES_DEVICE,
      ip: SALES_IP,
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
      commit({ syncing: false, lastSync: stamp() });
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
  });

  store.bus.on('reset', () => {
    commit({ queue: [], draft: EMPTY_DRAFT, sent: {}, syncing: false });
  });

  const mine = (): SalesOrder[] =>
    store
      .getState()
      .salesOrders.filter((order) => order.source === 'sales' && order.createdBy === userId());

  const approvalOf = (
    order: SalesOrder,
  ): { readonly status: ApprovalView; readonly request?: ApprovalRequest } => {
    if (order.approvalId === undefined) {
      return { status: 'tidak' };
    }
    const request = store.getState().approvals.find((item) => item.id === order.approvalId);
    return request === undefined ? { status: 'tidak' } : { status: request.status, request };
  };

  const customerTier = (): Tier =>
    data().customers.find((item) => item.id === state.draft.customerId)?.tier ?? state.catalogTier;

  return {
    store,
    printers: PRINTERS,
    now,
    state: () => state,
    subscribe: (listener) => bus.on('change', listener),
    allowed: (screen, action) => isAllowed(role(), screen, action),
    signedIn: () => state.userId !== undefined,
    userName: () => data().users.find((item) => item.id === state.userId)?.name ?? '',
    login: (username, password) => {
      const outcome = checkSalesLogin(
        data().users,
        username,
        password,
        store.getState().online,
        vault.known(),
      );
      if (outcome.kind === 'error') {
        return { ok: false, messageId: outcome.messageId, values: {} };
      }
      if (outcome.kind === 'label') {
        return { ok: false, labelKey: outcome.labelKey };
      }
      store.setUser(outcome.user.id);
      vault.write({ userId: outcome.user.id, expiresAt: clock() + SESSION_DAYS * DAY_MS });
      vault.remember(outcome.user.id);
      commit({ userId: outcome.user.id });
      log('masuk', `Masuk aplikasi Sales sebagai ${outcome.user.username}`);
      return { ok: true };
    },
    logout: () => {
      vault.clear();
      commit({ userId: undefined, queue: [], draft: EMPTY_DRAFT });
    },
    activate: () => {
      if (state.userId !== undefined && store.getState().userId !== state.userId) {
        store.setUser(state.userId);
      }
    },
    pending: () => state.queue.filter((item) => item.status !== 'terkirim').length,
    tier: customerTier,
    setCatalogTier: (tier) => {
      commit({ catalogTier: tier });
    },
    setDraft: (patch) => {
      commit({ draft: { ...state.draft, ...patch } });
    },
    addLine: (product, unit = preferredUnit(product), quantity = '1') => {
      const found = state.draft.lines.findIndex(
        (line) => line.productId === product.id && line.unit === unit,
      );
      const lines =
        found >= 0
          ? state.draft.lines.map((line, index) =>
              index === found
                ? {
                    ...line,
                    quantity: String(
                      (parseQuantity(line.quantity) ?? 0) + (parseQuantity(quantity) ?? 1),
                    ).replace('.', ','),
                  }
                : line,
            )
          : [...state.draft.lines, { productId: product.id, unit, quantity }];
      commit({ draft: { ...state.draft, lines } });
    },
    clearDraft: () => {
      commit({ draft: EMPTY_DRAFT });
    },
    saveOrder: (saveOptions = {}) => {
      if (!isAllowed(role(), 'SALES-03', 'Simpan Sales Order')) {
        return denied();
      }
      const draft = state.draft;
      const customer = data().customers.find((item) => item.id === draft.customerId);
      const check = checkSalesOrder(draft, lookup, customer, now());
      if (check.kind === 'error') {
        return { ok: false, messageId: check.messageId, values: check.values, line: check.line };
      }
      const warning = creditWarning(check.decision, customer, now());
      if (warning !== undefined && saveOptions.requestApproval !== true) {
        return { ok: false, warning };
      }
      if (warning !== undefined && !isAllowed(role(), 'SALES-04', 'Minta Persetujuan Owner')) {
        return denied();
      }
      const number = store.takeNumber('SO');
      let approvalId: string | undefined;
      if (warning !== undefined) {
        approvalId = `AP-${String(store.getState().approvals.length + 1)}`;
        store.addApproval({
          id: approvalId,
          kind: 'piutang',
          status: 'menunggu',
          requestedBy: userId(),
          at: stamp(),
          reference: number,
          amount: Math.max(0, check.total - check.downPayment),
          customerId: customer?.id,
          detail: warning.text,
          decidedBy: undefined,
          decidedAt: undefined,
          note: undefined,
        });
        log('otorisasi', `Permintaan persetujuan Owner untuk ${number}: ${warning.text}`);
      }
      const order: SalesOrder = {
        id: number,
        number,
        createdAt: stamp(),
        createdBy: userId(),
        customerId: customer?.id,
        lines: check.lines,
        total: check.total,
        payment: draft.payment,
        downPayment: check.downPayment,
        status: 'draf',
        source: 'sales',
        approvalId,
        synced: store.getState().online,
      };
      store.addSalesOrder(order);
      log('transaksi', `${number} Draf ${formatRupiah(check.total)} (${draft.payment})`);
      enqueue(`Sales Order ${number}`, number);
      commit({ draft: EMPTY_DRAFT });
      return { ok: true, number, approval: approvalId !== undefined };
    },
    orders: () => [...mine()].reverse(),
    approvalOf,
    sendCopy: (number, phone) => {
      if (!isAllowed(role(), 'SALES-05', 'Kirim Salinan SO (PDF) via WA')) {
        return denied();
      }
      const order = mine().find((item) => item.number === number);
      if (order === undefined) {
        return denied();
      }
      const approval = approvalOf(order).status;
      if (approval === 'menunggu') {
        return { ok: false, labelKey: 'tungguPersetujuan' };
      }
      if (approval === 'ditolak') {
        return { ok: false, labelKey: 'soDitolakOwner' };
      }
      if (!isValidPhone(phone)) {
        return { ok: false, messageId: 'MSG-044', values: {} };
      }
      const online = store.getState().online;
      log(
        'cetak',
        `Salinan SO ${number} (PDF) dikirim ke ${normalizePhone(phone)} via WA (simulasi)${online ? '' : ', menunggu sinkron'}`,
      );
      enqueue(`Salinan SO ${number} via WA`);
      commit({ sent: { ...state.sent, [number]: stamp() } });
      return { ok: true, queued: !online };
    },
    printCopy: (number) => {
      if (!isAllowed(role(), 'SALES-05', 'Cetak Bluetooth (simulasi)')) {
        return denied();
      }
      const order = mine().find((item) => item.number === number);
      if (order === undefined) {
        return denied();
      }
      if (state.printer === undefined) {
        return { ok: false, labelKey: 'pilihPrinterDulu' };
      }
      log('cetak', `Salinan SO ${number} dicetak ke ${state.printer} (simulasi)`);
      return { ok: true, printer: state.printer };
    },
    setPrinter: (printer) => {
      commit({ printer });
    },
  };
}
